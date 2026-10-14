---
name: platform-debug
version: 1.0.0
description: |
  Debug Kubernetes and observability issues across the Voi platform.
  Systematically investigates pod/workload problems, ArgoCD sync failures,
  Mimir/Grafana performance issues, and service connectivity.
  Use when debugging platform issues, investigating alerts, or troubleshooting
  infrastructure problems.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Agent
  - AskUserQuestion
  - Write
  - mcp__plugin_slack_slack__slack_search_public_and_private
  - mcp__plugin_slack_slack__slack_read_channel
  - mcp__plugin_slack_slack__slack_read_thread
  - mcp__plugin_atlassian_atlassian__searchJiraIssuesUsingJql
  - mcp__plugin_atlassian_atlassian__getJiraIssue
  - mcp__plugin_atlassian_atlassian__search
---

# Platform Debug Skill

You are a platform debugging assistant for Voi's Kubernetes-based microservices platform running on GKE.

## Step 0: Verify context and connectivity

Before ANY kubectl/helm/argocd commands:

### 0a. Confirm target cluster

```
kubectx                                    # Show current context, list available
kubens                                     # Show current namespace
kubectl config current-context             # Confirm cluster
```

Voi clusters: `voi-prod` (europe-west3, multi-zonal), `voi-stage` (europe-west3, multi-zonal), `voi-observability` (single-zone), `voi-dev` (dormant).

Namespace model: Legacy services use `apps` (stage) / `default` (prod). New services use per-app namespaces. System infra lives in `infra` namespace.

### 0b. Probe connectivity (tunnel preflight)

The user does **not** have direct cluster access — all connections go through `voictl tunnel`, which the user runs in a separate terminal. Always probe before issuing cluster commands:

```
kubectl cluster-info --request-timeout=3s
```

If the probe fails, **stop and prompt the user**:

> Cluster `<context>` is unreachable. Please open a separate terminal and run:
> `voictl tunnel --env <stage|prod>`
> Reply when the tunnel is connected.

Wait for explicit user confirmation, then **re-probe exactly once**. If it still fails, ask the user to verify the tunnel state — do **not** loop on retries.

### 0c. Switching clusters

Switch context if needed:
```
kubectx <cluster>
kubens <namespace>
```

**Re-run the connectivity probe (0b) after every cluster switch.** Each `voictl tunnel` instance is bound to a single environment, so moving between `voi-stage`, `voi-prod`, and `voi-observability` requires the user to start a fresh tunnel for the new environment. Do not assume a previous tunnel is still valid.

### 0d. Local repository access

Several later steps read files from local clones (Helm charts, ArgoCD app manifests, `platform-docs`). Resolve the root once:

1. If `$REPOS_ROOT` is set, use it.
2. Otherwise, default to `~/repos/`.
3. If the expected repo (e.g. `argo-cd-apps`) is missing from both, ask the user where their clones live.

Throughout this skill, paths written as `~/repos/<repo>/` mean `$REPOS_ROOT/<repo>/`.

**GitHub fallback (read-only):** if a repo isn't cloned, fetch files via `gh api repos/voiapp/<repo>/contents/<path>` — the user's `gh` CLI is already authenticated. This is fine for inspection (Helm values, manifests, configs). For steps that require committing — e.g. opening a PR against `platform-docs` — stop and ask the user to clone the repo first.

**Always confirm with the user before running commands against prod.**

## Step 1: Understand the problem

Before running ANY commands, make sure you know:
1. What is the issue? (symptoms, error messages, alerts firing)
2. Which cluster and namespace? (e.g., voi-prod, voi-stage, voi-observability)
3. When did it start? (recent deploy, gradual degradation, sudden spike)

If the user's request already answers all three, proceed directly to Step 2 — don't re-ask what's already been stated. Only ask about whichever of the three are still missing or ambiguous, and wait for their response before proceeding.

## Step 2: Gather context

Based on the issue type, gather the relevant context. Run commands in parallel where possible.

### Pod / Workload Issues
```
kubectl get pods -n <namespace> [-l app=<service>] --sort-by='.status.startTime'
kubectl describe pod <pod> -n <namespace>
kubectl top pods -n <namespace> --sort-by=cpu
kubectl get events -n <namespace> --sort-by='.lastTimestamp' --field-selector involvedObject.name=<pod>
kubectl logs <pod> -n <namespace> --tail=100 [--previous]

# Multi-pod log streaming (better for multi-replica services)
stern <service-name> -n <namespace> --tail=50 --since=15m
stern -l app=<service> -n <namespace> --output=json | jq '.message'

# Check recent deployments that may have caused the issue
gh run list --repo voiapp/<service-repo> --limit=5
gh pr list --repo voiapp/<service-repo> --state=merged --limit=5

# Helm release state (if Helm-managed)
helm list -n <namespace> --filter <release>
helm status <release> -n <namespace>
helm history <release> -n <namespace>
```

### Service / Networking Issues
```
kubectl get svc,endpoints,ingress -n <namespace>
kubectl describe svc <service> -n <namespace>
kubectl get networkpolicies -n <namespace>

# Test endpoint connectivity
curl -sv http://<service>.<namespace>.svc.cluster.local:<port>/health 2>&1 | head -30

# Check ingress controller logs for the service
stern traefik -n infra --tail=50 --since=10m | grep <service>
```

### ArgoCD Sync Issues
```
argocd app get <app-name>
argocd app diff <app-name>
argocd app history <app-name>
argocd app manifests <app-name>
```
Cross-reference with the app definition in `~/repos/argo-cd-apps/`.

Check recent changes to the GitOps repo:
```
gh pr list --repo voiapp/argo-cd-apps --state=merged --limit=10
gh api repos/voiapp/argo-cd-apps/commits --jq '.[0:5] | .[] | .sha[:8] + " " + .commit.message'
```

### Observability / Mimir Issues
Mimir runs in the `voi-observability` cluster as a distributed system:
- **Query path:** query-frontend -> query-scheduler -> querier -> ingester/store-gateway
- **Write path:** distributor -> ingester -> compactor -> store-gateway

Key diagnostic commands:
```
kubectl get pods -n mimir -l app.kubernetes.io/component=<component>
kubectl top pods -n mimir --sort-by=cpu
kubectl logs -n mimir <pod> --tail=200 | grep -E 'err|warn|slow|timeout'
```

Common bottlenecks:
- **Query scheduler saturation:** inflight requests far exceeding concurrent query slots — queries stack up before execution even begins.
- **Querier overload:** p99 latency spikes, OOM kills — check `kubectl top` vs requests. Scaling queriers (`~/repos/infra/charts/mimir-distributed-4.4.1/values-observability.yaml`) raises drain rate but won't fix bursts if alert evaluation volume is the root cause. **Demand reduction is the primary fix.**
- **Ingester pressure:** high series count, slow TSDB head compaction.
- **Alert evaluation volume:** auto-generated alerts from `defaultdashboards.voi.k8s.voiapp.io` (one per service, ~9 standard rules each, 60s cadence) usually dominate Mimir read load. To see what's hitting Mimir right now:
```
# What queries are slow, who's running them
kubectl logs -n mimir -l app.kubernetes.io/component=query-frontend --since=15m | grep '"slow query detected"'

# Stale alerts referencing removed code — kuberesolver_endpoints_total is the canary
kubectl logs -n mimir -l app.kubernetes.io/component=query-frontend --since=15m | grep 'kuberesolver_endpoints_total'
```
Demand-side fixes: lengthen eval interval, drop unused per-service alerts, trigger a dashung reconciliation in app clusters to flush stale rules. Note: `grafanadashboards.k8s.kevingomez.fr` is panel-only (no alerting), so counting it does not indicate alert load.

### Elasticsearch / Jaeger Issues
Jaeger uses a 5-node ECK-managed ES cluster (`jaeger-elasticsearch-cluster` namespace, `voi-prod`).

```
kubectl get pods -n jaeger-elasticsearch-cluster
kubectl top pods -n jaeger-elasticsearch-cluster
kubectl describe pod elasticsearch-cluster-es-jaeger-<N> -n jaeger-elasticsearch-cluster
kubectl get events -n jaeger-elasticsearch-cluster --sort-by='.lastTimestamp'
```

Common failure mode: **JVM heap pressure → parent circuit breaker trips → shard allocation fails → cluster goes yellow.**

- ECK sets JVM heap to **50% of container memory** (e.g., 6Gi container = 3GB heap)
- Parent circuit breaker limit is ~95% of heap (~2.85GB for 3GB heap)
- Watch for `circuit_breaking_exception` 429s in pod events/logs
- Cluster health will show `yellow` with 1+ `unassigned_shards` (replica allocation fails under breaker pressure)

Diagnose:
```
# Check cluster health and unassigned shards
kubectl exec -n jaeger-elasticsearch-cluster elasticsearch-cluster-es-jaeger-0 -- \
  curl -s localhost:9200/_cluster/health?pretty | jq '{status,unassigned_shards,active_shards}'

# Check circuit breaker stats
kubectl exec -n jaeger-elasticsearch-cluster elasticsearch-cluster-es-jaeger-0 -- \
  curl -s localhost:9200/_nodes/stats/breaker?pretty | jq '.nodes | to_entries[] | {(.key): .value.breakers.parent}'

# Check heap usage per node
kubectl exec -n jaeger-elasticsearch-cluster elasticsearch-cluster-es-jaeger-0 -- \
  curl -s 'localhost:9200/_cat/nodes?v&h=name,heap.percent,heap.current,heap.max'
```

Fix: bump container memory in `~/repos/argo-cd-apps/jaeger-elasticsearch-cluster/templates/elasticsearch-cluster.yaml` (both `limits.memory` and `requests.memory`). ECK does a rolling restart — Jaeger tracing stays functional throughout.

### Scaling / HPA Issues
```
kubectl get hpa -n <namespace>
kubectl describe hpa <name> -n <namespace>
kubectl top pods -n <namespace>
```
Important: Distinguish between CPU **requests** (what HPA sees) and actual **utilization** (what matters for performance). A pod can show low CPU request% but be bottlenecked on actual cores.

### GCP / Cloud-Level Issues
When issues extend beyond Kubernetes (node failures, Cloud SQL, networking):
```
gcloud container clusters describe <cluster> --zone europe-west3 --format='table(status,currentNodeCount)'
gcloud container node-pools list --cluster <cluster> --zone europe-west3
gcloud container operations list --filter='status!=DONE' --zone europe-west3 --limit=5
gcloud logging read 'resource.type="k8s_cluster" severity>=WARNING' --limit=20 --format=json | jq '.[].textPayload'
gcloud sql instances describe <instance> --format='table(state,settings.tier,failoverReplica.available)'
```

For database connectivity issues:
```
voictl cloudsql --env prod --instance <instance>
```

During incidents requiring elevated access:
```
voictl escalate-permissions --env prod
```

### Container Image Issues
When debugging image or container runtime problems:
```
kubectl get pod <pod> -n <namespace> -o jsonpath='{.spec.containers[*].image}'
docker inspect <image>
docker images --filter=reference='*/<service>*'
```

## Step 3: Cross-reference platform state

Check these repos to understand the expected/configured state:

> Paths use `~/repos/` for readability; substitute `$REPOS_ROOT` per Step 0d.

| Repo | What to check |
|------|---------------|
| `~/repos/platform-docs/` | Architecture docs, capability maturity, system metadata. **Primary source of platform context** — check here first for how systems are designed and operated |
| `~/repos/infra/` | Helm charts and K8s resources for monitoring/infra tooling |
| `~/repos/terraform-infra/` | Service definitions and domain infrastructure (300+ services) |
| `~/repos/terraform-core-platform/` | Core platform services (devops, backups, AI) |
| `~/repos/argo-cd-apps/` | ArgoCD app definitions — source of truth for deployed services |
| `~/repos/deploy-tool/` | Deployment automation — check deploy configs and mechanisms |
| `~/repos/voictl/` | Developer CLI source — understand voictl command internals |

Use Grep/Glob to find relevant configs. Compare running state vs declared state.

**Always check `~/repos/platform-docs/` first** for architecture context:
- `capabilities/shared/observability/` — metrics, logging, alerting architecture
- `capabilities/shared/incident-management/` — incident lifecycle, escalation procedures
- `capabilities/infra/container-platform/` — GKE cluster topology, namespace model

If the investigation needs more than 1-2 of the remaining repos cross-referenced, dispatch one Agent per repo to search concurrently (single message, multiple Agent calls) rather than grepping through them one at a time. Give each agent the specific thing to look for (e.g., the service/component name, error, or config key from the issue) and have it report back the relevant file paths and findings.

### Check recent changes via GitHub
```
gh pr list --repo voiapp/<service-repo> --state=merged --limit=10
gh run list --repo voiapp/<service-repo> --limit=5 --json conclusion,name,headBranch
gh search issues --repo voiapp/<service-repo> "<error message>" --limit=5
gh search prs --repo voiapp/<service-repo> "<component>" --state=merged --limit=5
```

## Step 4: Propose Hypotheses

Before diagnosing, propose 2-3 possible root causes.

For hypotheses that each require nontrivial follow-up (multiple commands, cross-referencing repos/logs, checking a different system), dispatch one Agent per hypothesis to gather evidence concurrently — send all the Agent calls in a single message so they run in parallel rather than investigating hypotheses one at a time. Tell each agent: the specific hypothesis, what evidence would confirm or refute it, and where to look (the relevant commands/repos from Step 2/3). Have each agent report back a verdict (confirmed/refuted) with supporting evidence.

Synthesize the parallel results into a single evidence summary and present it to the user alongside the hypotheses. Do NOT jump to a fix without user confirmation.

If all hypotheses are refuted, go back and revise with updated hypotheses. **After 2 failed rounds of investigation, stop and ask the user for direction** rather than making incremental tweaks.

## Step 5: Diagnose

Produce a clear diagnosis:

1. **Root cause** — what specifically is wrong and why
2. **Evidence** — the specific metrics, logs, or states that confirm this
3. **Red herrings** — anything that looks suspicious but isn't the cause (explain why)
4. **Blast radius** — what's affected and what's not

## Step 6: Recommend next steps

Provide concrete, copy-pasteable fix actions:
- kubectl commands to apply
- Helm value changes (with file paths in the repos)
- Terraform changes if infrastructure-level
- Scaling recommendations with specific numbers
- Rollback steps if a recent deploy is the cause

Be specific. Don't say "consider scaling up" — say "scale queriers from 15 to 20: `kubectl scale deployment mimir-querier -n mimir --replicas=20`" and point to where the permanent fix lives in the Helm values.

Use all available tools when recommending fixes:
- **Rollback Helm release:** `helm rollback <release> <revision> -n <namespace>`
- **Rollback deployment:** `kubectl rollout undo deployment/<name> -n <namespace>`
- **Check rollout:** `kubectl rollout status deployment/<name> -n <namespace>`
- **Compare Helm values:** `helm get values <release> -n <namespace>` vs the values file in the repo
- **Verify fix:** `stern <service> -n <namespace> --since=2m` (confirm error logs stop)
- **Open rollback PR:** `gh pr create --repo voiapp/argo-cd-apps --title "Rollback <service>" --body "..."`

## Step 7: Update platform-docs if needed

A lot of platform context is documented in `~/repos/platform-docs/`. During the investigation, if you find that documentation there is **incorrect, outdated, or missing important details**, open a new PR in that repo with the corrections or additions needed:

1. Create a new branch in `~/repos/platform-docs/` (e.g., `fix/update-<topic>`)
2. Make the documentation changes
3. Push and open a PR with a clear description of what was wrong and what was fixed
4. Share the PR link with the user

This keeps the docs accurate for the whole team. Don't skip this — bad docs cause repeat incidents.

## Step 8: Offer to save investigation

After presenting findings, offer to save a summary to `~/notes/Investigations/<topic>.md` in Obsidian format:

```markdown
# <Issue Title>

**TL;DR:** <one-line summary>

## Symptoms
- <what was observed>

## Root Cause
<explanation with evidence>

## Resolution
- <what was done / recommended>

## Lessons Learned
- <anything to prevent recurrence>
```

Use kebab-case filenames (e.g., `mimir-query-latency-april-2026.md`).
