---
name: debug-event-pipelines
version: 1.0.0
description: |
  Debug Voi's data ingestion pipelines end-to-end. Covers two pipeline types:
  - DATAFLOW (event) pipelines: Pub/Sub → compress-pubsub-exports → GCS → Snowflake
  - DBEXP pipelines: PostgreSQL scraper → GCS → Snowflake
  Diagnoses data freshness gaps, silent export failures, IAM misconfigurations, lock
  contention, warehouse capacity, and upstream GCP failures.
  Use when events are delayed, tables are stale, loads are failing, exports have stopped,
  or during an active incident.
allowed-tools:
  - Bash
  - AskUserQuestion
  - mcp__plugin_snowflake_snowflake__sql_exec_tool
---

# Debug Data Pipelines

You are a debugging assistant for Voi's data ingestion pipelines. There are two distinct pipeline types — identify which one applies before proceeding.

**DATAFLOW pipeline** (event-driven):
```
Pub/Sub → compress-pubsub-exports (Cloud Run) → GCS bucket
       → gcs_snowflake_dataflow_bucket_watcher (Cloud Functions) or Dataflow job (high-volume)
       → Snowflake: <TABLE>_RAW_STREAM → <TABLE>_RAW_STREAM_VIEW → <TABLE>_RAW → <TABLE>
```

**DBEXP pipeline** (PostgreSQL scraper):
```
PostgreSQL (source DB)
  → dbexp scraper — queries rows WHERE _row_updated_at > lastRun AND <= now-30s
  → local in-memory/badger cache (FlushAll triggers GCS upload)
  → GCS bucket (/v3/raw/table=…)
  → gcs_snowflake_dbexp_bucket_watcher (Cloud Functions)
  → Snowflake: LAKE.DBEXP.<TABLE>
```

Snowflake DATAFLOW stage breakdown:
- `<TABLE>_RAW_STREAM` — stream connected to GCS stage, holds incoming data temporarily
- `<TABLE>_RAW_STREAM_VIEW` — view consuming the stream; defines column mapping and type conversions
- `<TABLE>_RAW` — staging table populated by INSERT from `_RAW_STREAM_VIEW`
- `<TABLE>` (no suffix) — final typed table; what dbt models read from

**Service user:** All pipeline queries in Snowflake run under `CI_DATA_PIPELINES`.

---

## How to run Snowflake queries

Check availability in this order and use whichever works:

**1. Snowflake MCP** — use `mcp__plugin_snowflake_snowflake__sql_exec_tool` if available.

**2. snowsql CLI** — if the MCP is not installed, try the default connection:
```bash
snowsql -q "<SQL>"
```
snowsql uses its default configured connection — do not pass credentials or read config files.

**3. Neither available** — output the SQL as a formatted code block, ask the user to run it in the Snowflake console or their preferred client, and wait for them to paste back the results before continuing.

---

## Step 0: Understand the scope

Ask the user if they haven't already specified:
- Which pipeline, table, or event type is affected (e.g., `VEHICLE_SNAPSHOT`, `zones.zones`, "all")
- What they're observing (stale data, failed loads, slow inserts, missing events, stopped exports)
- Approximately when the issue started
- Was there a recent config change (DB host, IAM alias, prefix, deployment)?

**Identify the pipeline type:**

| Signal | Pipeline type |
|--------|--------------|
| Table is in `LAKE.DATAFLOW.*` | DATAFLOW |
| Table is in `LAKE.DBEXP.*` | DBEXP |
| Issue is "scraper stopped writing to GCS" | DBEXP |
| Issue is "events delayed / Snowflake stale" | DATAFLOW |
| Table comes from a PostgreSQL DB export | DBEXP |

→ **DATAFLOW issue**: proceed to Step 0a (pipeline config) then Steps 1–6.

→ **DBEXP issue**: proceed to **Step D0** (dbexp scraper diagnostic) then rejoin at Step 6c (dbexp bucket watcher) if data is missing from Snowflake but present in GCS.

### Step 0a: Check the Metabase ingestion dashboard first

Before running any SQL, always output this link and ask the user to open it:

> **Data Platform Ingestion Overview:**
> https://metabase.voiapp.io/dashboard/3745-data-platform-ingestion-overview?date_range=past90days&days_to_lookback=90&tab=1427-per-table(s)&target_schema=DATAFLOW&

It shows load status, duration trends, and freshness per table in one place and may immediately reveal the scope of the issue. Ask the user what they see before proceeding with SQL queries.

- Use the **"Per table(s)"** tab with `target_schema = DATAFLOW` to see per-pipeline status
- Adjust `date_range` / `days_to_lookback` to narrow to the incident window
- If the dashboard already shows the affected table (freshness gap, failure spike, duration spike), use that as context and skip whichever of Steps 1–6 are already answered

Then look up the pipeline config to get the exact GCS path and Snowflake destination.

### Step 0b: Look up DATAFLOW pipeline configuration

**If running in the data-pipelines repo locally:**
```bash
# Find which config file handles the affected table/event
grep -r "VEHICLE_SNAPSHOT\|RIDE_ENDED\|<EVENT_NAME>" \
  pipelines/src/imports/gcs_snowflake/config/ -l

# Then read the specific config
cat pipelines/src/imports/gcs_snowflake/config/<file>.yaml
```

**If not in the repo, use gh CLI:**
```bash
# Search across all config files on GitHub
gh api repos/voiapp/data-pipelines/git/trees/main?recursive=1 \
  --jq '.tree[] | select(.path | startswith("pipelines/src/imports/gcs_snowflake/config/")) | .path'

# Read a specific config file
gh api repos/voiapp/data-pipelines/contents/pipelines/src/imports/gcs_snowflake/config/<file>.yaml \
  --jq '.content' | base64 -d

# Search for a specific table/event name across all configs
gh search code --repo voiapp/data-pipelines "<TABLE_OR_EVENT_NAME>" \
  --match=content --extension=yaml
```

**If neither is accessible**: https://github.com/voiapp/data-pipelines/tree/main/pipelines/src/imports/gcs_snowflake/config

**Key things to extract from the config:**
- `gcs_path` — the GCS bucket path where files arrive (e.g., `/pubsub/vehicle-unified-format-snapshot-events-v1-gcs/`)
- `destination.lake` — the Snowflake final table (e.g., `LAKE.DATAFLOW.VEHICLE_SNAPSHOT_EVENTS_V1`)
- `destination.strategy` — `merge`, `merge_checksum`, or `append`
- Whether there are multiple destinations (main table + `_RECENT` + `_LATEST` variants)

**Common high-volume pipelines to reference quickly:**

| GCS Path | Snowflake Table | Strategy |
|----------|----------------|----------|
| `/pubsub/vehicle-unified-format-snapshot-events-v1-gcs/` | `LAKE.DATAFLOW.VEHICLE_SNAPSHOT_EVENTS_V1` | append |
| `/pubsub/vehicle-unified-format-snapshot-events-v1-gcs/` | `LAKE.DATAFLOW.VEHICLE_SNAPSHOT_EVENTS_V1_LATEST` | merge |
| `/pubsub/voiridesv2.rideendedevent` | `LAKE.DATAFLOW.RIDE_ENDED_EVENT` | merge_checksum |
| `/pubsub/vehicle-telemetry/` | `LAKE.DATAFLOW.VEHICLE_TELEMETRY` | append |
| `/pubsub/vehicle-telemetry/` | `LAKE.DATAFLOW.VEHICLE_TELEMETRY_LATEST` | append |
| `/pubsub/fenced-snapshot-event/` | `LAKE.DATAFLOW.FENCED_SNAPSHOT_EVENT` | append |
| `/pubsub/vehicle-api-raw-event-envelope-gcs/` | `LAKE.DATAFLOW.VEHICLE_RAW_EVENT` | append |
| `/pubsub/voi-rental-v1-raw-rental-snapshot/` | `LAKE.DATAFLOW.RENTAL` | merge |
| `/pubsub/ride-precheck/` | `LAKE.DATAFLOW.RIDE_PRECHECK` | merge_checksum |
| `/pubsub/voi-psp-v1-raw-charge-upsert/` | `LAKE.DATAFLOW.CHARGE` | merge |
| `/pubsub/voi-psp-v1-raw-payment-method-upsert/` | `LAKE.DATAFLOW.PAYMENT_METHOD` | merge |

Then confirm gcloud access before running any GCP commands:
```bash
gcloud auth list
gcloud config get-value project
```
If gcloud is not authenticated, provide all commands for the user to run manually and ask them to paste the output.

---

## [DBEXP] Step D0: Establish last known good state

The dbexp scraper stores its progress in Firestore and writes files to GCS. The key invariant:

> **`state.Set` (Firestore update) only runs if `FlushAll` (GCS write) returned nil.**
> If Firestore shows a recent timestamp, either GCS was written successfully, or `FlushAll` silently swallowed a GCS error.

**Check the Firestore state for the affected table:**
- Collection: `dbexpState`
- Document ID: `{VOI_EXPORT_PREFIX}-{dbName}.{schema}.{table}` (e.g. `v3-cityregs.zones.zones`)
- Field: `LastExportedRecord` (timestamp of last exported row)

**Check the `dbexp_records_to_cache` metric** in Grafana/Cloud Monitoring:
- Is it still firing each scrape interval?
- When did it last fire?
- Is the count > 0 or exactly 0?

| Observation | Meaning | Next step |
|-------------|---------|-----------|
| Metric > 0, Firestore updated, GCS empty | FlushAll silently failing (likely IAM) | Step D2 |
| Metric = 0, Firestore timestamp stuck | Query returns 0 rows — no new DB data | Step D3 |
| Metric > 0, Firestore NOT updated | FlushAll returned an error | Step D4 (pod logs) |
| No metric at all | Pod down or DB connection failing | Step D4 |

---

## [DBEXP] Step D1: Check the GCS bucket

The dbexp GCS path structure is:
```
gs://{VOI_EXPORT_BUCKET}/{VOI_EXPORT_PREFIX}/raw/table={schema}.{table}/date={YYYY-MM-DD}/hour={HH}/...
```

Check for files on the date of the last Firestore timestamp:
```bash
# List files for the date when Firestore says export last ran
gsutil ls -r "gs://{BUCKET}/{PREFIX}/raw/table={schema}.{table}/date={YYYY-MM-DD}/"

# Check if ANY files exist for this table
gsutil ls "gs://{BUCKET}/{PREFIX}/raw/table={schema}.{table}/"
```

| Result | Meaning |
|--------|---------|
| Files exist in GCS for that date | Export worked — proceed to Step 6c if Snowflake is stale |
| GCS completely empty for this table | FlushAll silently failing → check IAM (Step D2) |
| Files in GCS but Snowflake stale | dbexp bucket watcher issue → Step 6c |

If `VOI_EXPORT_BUCKET` / `VOI_EXPORT_PREFIX` are unknown, check the K8s deployment or Helm values for the dbexp instance serving this table.

---

## [DBEXP] Step D2: Verify GCS IAM permissions

When a new `iamServiceAlias` is added to the dbexp config (e.g. `iamServiceAlias: cityregs`), it creates a GCP SA `wi-dbe-{alias}@{project}.iam.gserviceaccount.com`. This SA gets DB access automatically but **GCS write access must be granted separately**.

```bash
# Check what roles the SA has on the project
gcloud projects get-iam-policy {PROJECT_ID} \
  --flatten="bindings[].members" \
  --filter="bindings.members:wi-dbe-{alias}" \
  --format="table(bindings.role,bindings.members)"

# Check bucket-level IAM directly
gsutil iam get gs://{VOI_EXPORT_BUCKET}
```

The SA needs at minimum `roles/storage.objectCreator` on the export bucket. If missing, this is the root cause of the silent failure — grant the role and verify the next scrape writes to GCS.

---

## [DBEXP] Step D3: Check if source database has new data

Connect to the source PostgreSQL DB and run:

```sql
-- Any rows newer than the Firestore timestamp?
SELECT COUNT(*)
FROM {schema}.{table}
WHERE _row_updated_at > '{LastExportedRecord}'::timestamptz;

-- Rows with NULL _row_updated_at? (app not setting the column)
SELECT COUNT(*)
FROM {schema}.{table}
WHERE _row_updated_at IS NULL;

-- Most recent timestamp in the table?
SELECT MAX(_row_updated_at), COUNT(*) FROM {schema}.{table};
```

| Result | Meaning |
|--------|---------|
| COUNT > 0 after Firestore timestamp | DB has data — check pod logs for query errors (Step D4) |
| COUNT = 0, NULL count = 0 | DB genuinely has no new writes — confirm with owning team |
| NULL count > 0 | App writes rows without setting `_row_updated_at` — fix is in the source app |

**Note:** `_row_updated_at` is application-managed in dbexp (no DB triggers). Every INSERT/UPDATE in the source app must set this column for the scraper to detect changes.

---

## [DBEXP] Step D4: Check pod logs

```bash
# Recent logs from the dbexp pod
kubectl logs -n {namespace} -l app=dbexp --since=24h \
  | grep -E "error|flush|gcs|storage|permission|could not" -i | tail -50

# If the pod has restarted, check the previous instance
kubectl logs -n {namespace} -l app=dbexp --previous \
  | grep -E "error|flush|gcs" -i | tail -30

# Confirm the scraper worker for this table is registered
kubectl logs -n {namespace} -l app=dbexp --since=5m \
  | grep "{schema}-{table}-scraper"
```

**What to look for:**
- `"error flushing exporter"` — FlushAll returned an error; GCS write failed
- `"permission denied"` / `"403"` — IAM issue confirmed (see Step D2)
- `"could not store state"` — Firestore write failed after successful GCS write
- `"could not fetch last run timestamp"` — Firestore read failing; scraper aborts without exporting
- Complete absence of any logs — pod not running or misrouted

---

## [DBEXP] Step D5: Check for Firestore key mismatch after migration

If the dbexp config changed `dbName` (e.g. from `voi-userex` to `cityregs`), the Firestore document key changes:

- Old: `v3-voi-userex.{schema}.{table}`
- New: `v3-cityregs.{schema}.{table}`

The new key starts with no prior state (treated as time zero), triggering a **full table re-export on first run**. After the re-export, the scraper waits for rows with `_row_updated_at > MAX(_row_updated_at)` at migration time.

If you see a correct Firestore document but GCS has no data: the full re-export may have silently failed to write to GCS → go back to Step D2.

---

## Step 1: Gather baseline — which DATAFLOW pipelines are affected

Check `ADMIN.LOGS.LOAD` first — this is the primary signal for Snowflake load activity.
All entries are for the `CI_DATA_PIPELINES` service user.

```sql
-- Replace the LIKE patterns with the affected table name from Step 0
select
  load_name,
  target_table,
  max(load_key) as latest_load_key,
  max(started_at) as last_run,
  max(status) as current_status,
  max(duration_sec) as last_duration_sec,
  count(*) filter (where status = 'IN_PROGRESS') as concurrent_runs,
  max(row_count) as last_row_count
from admin.logs.load
where target_table like '%DATAFLOW%'
  and target_table like '%<TABLE_NAME>%'  -- e.g. '%VEHICLE_SNAPSHOT%' or '%RIDE_ENDED%'
group by load_name, target_table
order by last_run desc
```

To see all pipelines at once (broader triage):
```sql
select
  load_name,
  target_table,
  max(started_at) as last_run,
  max(status) as current_status,
  max(duration_sec) as last_duration_sec,
  count(*) filter (where status = 'IN_PROGRESS') as concurrent_runs
from admin.logs.load
where target_table like '%DATAFLOW%'
  and started_at >= dateadd('hour', -2, current_timestamp())
group by load_name, target_table
order by last_run desc
```

**What to look for:**
- `IN_PROGRESS` loads that haven't completed → warehouse or lock issue
- `last_duration_sec > 300` → slow load (file size or stream backlog)
- Gaps in `last_run` > 5 min → pipeline not triggering (check GCP upstream in Step 6)
- `status = 'FAILED'` → stream consumption or insert error

If no recent loads for the affected table, proceed directly to Step 6 (GCP upstream debugging).

---

## Step 2: Check data freshness gaps

```sql
-- Replace <TABLE> with the final table name from config (e.g., VEHICLE_SNAPSHOT_EVENTS_V1)
select
  '<TABLE>_RAW' as stage,
  max(_inserted_timestamp) as latest_event,
  current_timestamp() as now,
  datediff('minute', max(_inserted_timestamp), current_timestamp()) as lag_minutes
from lake.dataflow.<table>_raw   -- lowercase

union all

select
  '<TABLE> (final)',
  max(_inserted_timestamp),
  current_timestamp(),
  datediff('minute', max(_inserted_timestamp), current_timestamp())
from lake.dataflow.<table>       -- lowercase, no suffix
```

For multi-destination tables (those with `_LATEST`/`_RECENT` variants per config), also check:
```sql
select
  '<TABLE>_LATEST' as stage,
  max(_inserted_timestamp) as latest_event,
  current_timestamp() as now,
  datediff('minute', max(_inserted_timestamp), current_timestamp()) as lag_minutes
from lake.dataflow.<table>_latest
```

**What to look for:**
- Lag > SLA (typically 2 min for ride events, 5 min for snapshots) → incident confirmed
- `_RAW` fresh but final table stale → INSERT from `_RAW` to final table is blocked
- Both `_RAW` and final table stopped at same time → stream consumption failed, check GCP (Step 6)
- Final table fresh but `_LATEST` stale → merge step for latest snapshot is failing
- All tables healthy but downstream dbt models stale → dbt run issue, not ingestion

---

## Step 3: Identify blocking queries

```sql
-- Currently running pipeline queries
select
  query_id,
  query_text,
  warehouse_name,
  start_time,
  datediff('minute', start_time, current_timestamp()) as running_minutes,
  partitions_scanned,
  partitions_total,
  bytes_scanned,
  bytes_spilled_to_disk
from table(information_schema.query_history(
  result_limit => 1000,
  transaction_id => null
))
where
  user_name = 'CI_DATA_PIPELINES'
  and end_time is null
  and datediff('minute', start_time, current_timestamp()) > 1
order by running_minutes desc
```

```sql
-- Recent failures and slow runs by CI_DATA_PIPELINES (last 2h)
select
  query_id,
  query_text,
  execution_status,
  start_time,
  total_elapsed_time / 1000.0 as duration_sec,
  bytes_scanned,
  bytes_spilled_to_remote_storage,
  error_message
from table(information_schema.query_history(
  result_limit => 500,
  transaction_id => null
))
where
  user_name = 'CI_DATA_PIPELINES'
  and start_time >= dateadd('hour', -2, current_timestamp())
  and (execution_status = 'FAILED' or total_elapsed_time > 180000)
order by start_time desc
```

**What to look for:**
- Queries running > 3 min → warehouse too small or stream backlog
- High `bytes_spilled_to_remote_storage` → memory pressure, scale warehouse up
- Multiple INSERTs to same table running concurrently → lock contention
- `execution_status = 'FAILED'` + `error_message` → root cause of load failure

---

## Step 4: Check warehouse capacity

```sql
select
  warehouse_name,
  count(*) filter (where query_type = 'DML') as dml_count,
  count(*) filter (where query_type = 'DML' and end_time is null) as dml_running,
  sum(datediff('second', start_time, end_time)) / 60.0 as total_minutes,
  max(total_execution_time) / 1000.0 as slowest_query_sec,
  avg(total_execution_time) / 1000.0 as avg_query_sec
from snowflake.account_usage.query_history
where
  user_name = 'CI_DATA_PIPELINES'
  and start_time >= dateadd('hour', -2, current_timestamp())
group by warehouse_name
order by dml_running desc
```

**What to look for:**
- `dml_running >= warehouse_size_credits` → saturation, scale up immediately
- `avg_query_sec > 180` → warehouse underpowered for current load
- Multiple concurrent DML → lock contention risk

**Fix:** Scale warehouse up 1–2 levels in Snowflake console while the load is blocked. Scale back down after the backlog clears. Monitor for 15+ min to confirm recovery.

---

## Step 5: Analyze query performance details

```sql
select
  query_id,
  query_text,
  execution_status,
  start_time,
  total_execution_time / 1000.0 as duration_sec,
  scan_bytes / (1024 * 1024 * 1024.0) as scan_gb,
  spilled_bytes_to_remote_storage / (1024 * 1024 * 1024.0) as spilled_gb,
  rows_inserted,
  compilation_time / 1000.0 as compilation_sec,
  error_message
from snowflake.account_usage.query_history
where
  user_name = 'CI_DATA_PIPELINES'
  and query_type = 'INSERT'
  and start_time >= dateadd('hour', -6, current_timestamp())
order by total_execution_time desc
limit 10
```

Open the specific `query_id` in the Snowflake console to inspect the execution plan.

**What to look for:**
- High `scan_gb` → stream view doing a full table scan (should be simple column mapping)
- High `spilled_gb` → memory pressure, warehouse too small
- High `compilation_sec` → overly complex stream view definition
- `execution_status = 'FAILED'` + `error_message` → the actual error causing load failures

---

## Step 6: GCP upstream debugging

Run this when:
- `ADMIN.LOGS.LOAD` shows no recent loads for the affected table, OR
- Step 2 shows both `_RAW` and the final table stalled at the same time, OR
- A DBEXP table has data in GCS (Step D1) but is not appearing in Snowflake

### Step 6a: Quick upstream triage

```bash
# 1. Compression pipeline — did events get compressed and land in GCS?
gcloud logging read \
  'resource.type="cloud_run_revision" resource.labels.service_name="compress-pubsub-exports"' \
  --project=vanilla-one-206813 --limit=50 --format="table(timestamp,severity,textPayload)"

# 2. Bucket watcher — did it trigger when files arrived? (DATAFLOW pipeline)
gcloud logging read \
  'resource.type="cloud_function" resource.labels.function_name="gcs_snowflake_dataflow_bucket_watcher"' \
  --project=voi-data-warehouse --limit=50 --format="table(timestamp,severity,textPayload)"

# 3. dbexp bucket watcher (DBEXP pipeline)
gcloud logging read \
  'resource.type="cloud_function" resource.labels.function_name="gcs_snowflake_dbexp_bucket_watcher"' \
  --project=voi-data-warehouse --limit=50 --format="table(timestamp,severity,textPayload)"

# 4. All errors across GCP components in last hour
gcloud logging read \
  'severity>=ERROR resource.type=("cloud_function" OR "cloud_run_revision")' \
  --project=voi-data-warehouse --limit=100 --freshness=1h \
  --format="table(timestamp,resource.labels.function_name,textPayload)"
```

**Decision tree:**

```
No loads in ADMIN.LOGS.LOAD?
│
├─ DATAFLOW pipeline?
│   ├─ Bucket watcher invocations present?
│   │   ├─ YES → watcher triggering but failing: check errors + Snowflake creds
│   │   └─ NO  → watcher not being triggered ↓
│   ├─ Compression logs present?
│   │   ├─ YES → files in GCS but GCS event not firing: check Pub/Sub subscription (Step 6e)
│   │   └─ NO  → upstream of compression: check Pub/Sub topic backlog (Step 6e) ↓
│   └─ Dataflow jobs (high-volume) running?
│       ├─ NO  → restart Dataflow job (Step 6d)
│       └─ YES → check systemLag and ElementsDropped (Step 6d)
│
└─ DBEXP pipeline?
    ├─ Files in GCS? (check Step D1 first)
    │   ├─ NO  → scraper not writing: check IAM (Step D2), pod logs (Step D4)
    │   └─ YES → files landed but watcher not triggering or failing
    └─ dbexp bucket watcher invocations present? (Step 6c)
        ├─ YES → watcher failing: check errors + Snowflake creds
        └─ NO  → GCS event not firing: check Pub/Sub subscription for dbexp bucket
```

**Note:** DBEXP tables (`LAKE.DBEXP.*`) come from `/v3/raw/table=...` GCS paths and use the dbexp bucket watcher. DATAFLOW tables (`LAKE.DATAFLOW.*`) come from `/pubsub/...` GCS paths.

### Step 6b: Compression pipeline metrics (Cloud Run — DATAFLOW only)

```bash
# Request latency and HTTP status
gcloud logging read \
  'resource.type="cloud_run_revision" resource.labels.service_name="compress-pubsub-exports" httpRequest.status>=200' \
  --project=vanilla-one-206813 --limit=100 \
  --format="table(timestamp,httpRequest.status,httpRequest.latency,httpRequest.requestSize)"

# Errors only
gcloud logging read \
  'resource.type="cloud_run_revision" resource.labels.service_name="compress-pubsub-exports" severity>=ERROR' \
  --project=vanilla-one-206813 --limit=50 --freshness=2h \
  --format="table(timestamp,severity,textPayload,jsonPayload.message)"

# Service config — check timeout and concurrency limits
gcloud run services describe compress-pubsub-exports \
  --region=europe-west3 --project=vanilla-one-206813 \
  --format="yaml(status.conditions,status.traffic,spec.template.spec.containerConcurrency,spec.template.spec.timeoutSeconds)"
```

| Metric | Normal | Warning | Critical |
|--------|--------|---------|----------|
| Request latency | < 5s | 5–30s | > 30s |
| Error rate | 0% | < 1% | > 1% |
| Request gap | < 2 min | 2–5 min | > 5 min |

### Step 6c: GCS bucket watcher metrics (Cloud Functions)

```bash
# Execution logs — DATAFLOW watcher
gcloud logging read \
  'resource.type="cloud_function" resource.labels.function_name="gcs_snowflake_dataflow_bucket_watcher"' \
  --project=voi-data-warehouse --limit=200 --freshness=2h \
  --format="table(timestamp,severity,textPayload)" | grep -E "execution_id|finished|duration|error"

# Errors only — DATAFLOW watcher
gcloud logging read \
  'resource.type="cloud_function" resource.labels.function_name="gcs_snowflake_dataflow_bucket_watcher" severity>=ERROR' \
  --project=voi-data-warehouse --limit=50 --freshness=2h \
  --format="table(timestamp,severity,textPayload)"

# Errors only — DBEXP watcher
gcloud logging read \
  'resource.type="cloud_function" resource.labels.function_name="gcs_snowflake_dbexp_bucket_watcher" severity>=ERROR' \
  --project=voi-data-warehouse --limit=50 --freshness=2h \
  --format="table(timestamp,severity,textPayload)"

# Function config — timeout and memory limits
gcloud functions describe gcs_snowflake_dataflow_bucket_watcher \
  --region=europe-west3 --project=voi-data-warehouse \
  --format="table(name,status,timeout,availableMemoryMb,maxInstances,updateTime)"
```

| Metric | Normal | Warning | Critical |
|--------|--------|---------|----------|
| Execution duration | < 60s | 60–240s | > 240s / timeout |
| Error rate | 0% | < 2% | > 2% |
| Invocation gap | < file arrival rate | 2× expected gap | > 5 min gap |

**What to look for:**
- Duration approaching `timeout` → function killed mid-run, increase timeout or fix slow path
- `availableMemoryMb` too low → OOM kills (silent stops, no error logged)
- Errors mentioning Snowflake → connection or credential issue
- `maxInstances` reached → files queuing in Pub/Sub, increase limit

### Step 6d: Dataflow job metrics (high-volume DATAFLOW pipelines)

Used for high-throughput streams (e.g., `VEHICLE_TELEMETRY`, `VEHICLE_RAW_EVENT`, `FENCED_SNAPSHOT_EVENT`).

```bash
# List all active Dataflow jobs
gcloud dataflow jobs list \
  --region=europe-west3 --project=voi-data-warehouse \
  --status=active \
  --format="table(id,name,currentState,creationTime,location)"

# Key metrics — throughput, lag, CPU (replace JOB_ID)
gcloud beta dataflow metrics list JOB_ID \
  --region=europe-west3 --project=voi-data-warehouse \
  --format="json" | python3 -c "
import sys, json
metrics = json.load(sys.stdin)
key_metrics = ['ElementCount', 'ElementsDropped', 'backlog', 'systemLag', 'workerCpuUtilization', 'currentVcpuCount']
for m in metrics:
  name = m.get('name', {}).get('name', '')
  if any(k.lower() in name.lower() for k in key_metrics):
    print(f'{name}: {m.get(\"scalar\", m.get(\"distribution\", \"N/A\"))} (updated: {m.get(\"updateTime\", \"\")})')
"

# Job errors
gcloud logging read \
  'resource.type="dataflow_step" labels."dataflow.googleapis.com/job_id"="JOB_ID" severity>=ERROR' \
  --project=voi-data-warehouse --limit=50 \
  --format="table(timestamp,severity,textPayload)"
```

| Metric | Normal | Warning | Critical |
|--------|--------|---------|----------|
| System lag | < 30s | 30s–5min | > 5min |
| Elements dropped | 0 | any > 0 | any > 0 |
| CPU utilization | < 70% | 70–85% | > 85% |

**What to look for:**
- `systemLag` growing → Pub/Sub backlog building, workers can't keep up
- `ElementsDropped` > 0 → data loss, escalate immediately
- Job state `JOB_STATE_FAILED` → restart the job

### Step 6e: Pub/Sub subscription backlog

Run this when compression looks healthy but the bucket watcher isn't triggering:

```bash
gcloud pubsub subscriptions list --project=vanilla-one-206813 \
  --format="table(name,topic,pushConfig.pushEndpoint,ackDeadlineSeconds)"

gcloud pubsub subscriptions list --project=voi-data-warehouse \
  --format="table(name,topic,pushConfig.pushEndpoint,ackDeadlineSeconds)"

# Describe a specific subscription to see backlog
gcloud pubsub subscriptions describe SUBSCRIPTION_NAME \
  --project=vanilla-one-206813
```

**What to look for:**
- Large `num_undelivered_messages` → Pub/Sub backlog, downstream not consuming
- `oldest_unacked_message_age` growing → messages stuck, consumer stalled

---

## Common Fixes

**DBEXP export stopped (GCS empty):**
- Most likely: new `iamServiceAlias` SA missing `roles/storage.objectCreator` on the export bucket — grant it and verify next scrape
- Check pod logs for `"error flushing exporter"` to confirm
- If GCS has data but Snowflake is stale → check dbexp bucket watcher (Step 6c)

**DBEXP export stuck at old timestamp (no new DB rows):**
- Source app is not writing to the DB, or not setting `_row_updated_at` on writes
- Check for NULL `_row_updated_at` rows in the source table — if found, fix is in the source app
- Confirm with the owning team that the app is deployed and serving writes

**Slow or blocking INSERT (Snowflake):**
- Scale warehouse up 1–2 levels immediately
- Scale back down once the backlog clears
- If recurring at same time daily → rush hour throttling, increase baseline warehouse size

**Stream backlog growing:**
- Check `_RAW_STREAM_VIEW` for expensive joins or aggregations — should be simple column mapping only
- If backlog is very large: `ALTER STREAM ... SET CHANGE_TRACKING = OFF` then back `ON` to reset
- Review the `conversion:` expressions in the pipeline config — complex ones slow down the view

**Bucket watcher not triggering:**
- Check Pub/Sub subscription dead-letter queue
- Verify function `maxInstances` is not capped too low
- Check Snowflake credentials haven't expired

**Dataflow job stuck:**
- If `systemLag` > 5 min and not improving: drain and restart the job
- If `ElementsDropped` > 0: investigate immediately, check worker logs for errors

---

## Code & Deployment Locations

| Component | Code | Deployment |
|-----------|------|------------|
| dbexp scraper | [`github.com/voiapp/dbexp`](https://github.com/voiapp/dbexp) | K8s pod per DB instance |
| Pipeline configs (DATAFLOW events) | [`pipelines/src/imports/gcs_snowflake/config/`](https://github.com/voiapp/data-pipelines/tree/main/pipelines/src/imports/gcs_snowflake/config) in data-pipelines | — |
| Core ingestion library | [`pipelines/src/imports/gcs_snowflake/`](https://github.com/voiapp/data-pipelines/tree/main/pipelines/src/imports/gcs_snowflake) in data-pipelines | — |
| Regular Airflow DAGs | [`dags/`](https://github.com/voiapp/airflow/tree/master/dags) in airflow repo | Airflow UI |
| dbexp Airflow DAGs | [`dags/dbexp`](https://github.com/voiapp/airflow/tree/master/dags/dbexp) in airflow repo | Airflow UI |
| DATAFLOW bucket watcher | — | Cloud Function `gcs_snowflake_dataflow_bucket_watcher` (project: voi-data-warehouse) |
| DBEXP bucket watcher | — | Cloud Function `gcs_snowflake_dbexp_bucket_watcher` (project: voi-data-warehouse) |
| Compression pipeline | [`compress-pubsub-exports`](https://github.com/voiapp/compress-pubsub-exports) repo | Cloud Run `compress-pubsub-exports` (project: vanilla-one-206813) |
| Dataflow template | [`beam-templates/pubsub-to-text`](https://github.com/voiapp/beam-templates/tree/master/pubsub-to-text) | Dataflow jobs (project: voi-data-warehouse) |
| Dataflow job config | [`argo-cd-apps/kubernetes-config-connector-resources/templates`](https://github.com/voiapp/argo-cd-apps/tree/main/kubernetes-config-connector-resources/templates) | ArgoCD |
