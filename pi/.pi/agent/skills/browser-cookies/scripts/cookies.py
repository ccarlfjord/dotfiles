#!/usr/bin/env python3
"""Read Firefox cookies from local profiles (native Linux or WSL/Windows).

Pure stdlib: no sqlite3 CLI or crypto deps required. Values are only printed
when the caller explicitly asks for a format that contains them.
"""

import argparse
import glob
import os
import platform
import shutil
import sqlite3
import sys
import tempfile
import time


def is_wsl():
    return "microsoft" in platform.uname().release.lower() or os.path.isdir(
        "/mnt/c/Windows"
    )


def firefox_databases():
    """Return (profile_dir, cookies.sqlite) for every Firefox profile found."""
    home = os.path.expanduser("~")
    patterns = []
    if is_wsl():
        patterns.append("/mnt/c/Users/*/AppData/Roaming/Mozilla/Firefox/Profiles/*")
    patterns += [
        f"{home}/.mozilla/firefox/*",
        f"{home}/snap/firefox/common/.mozilla/firefox/*",
        f"{home}/.var/app/org.mozilla.firefox/.mozilla/firefox/*",
    ]
    found = []
    for pattern in patterns:
        for profile in glob.glob(pattern):
            db = os.path.join(profile, "cookies.sqlite")
            if os.path.exists(db):
                found.append((profile, db))
    return found


def pick_profile(profiles, selector):
    if not profiles:
        sys.exit("no Firefox cookie databases found")
    if selector:
        matches = [p for p in profiles if selector in p[0]]
        if not matches:
            sys.exit(f"no profile matching {selector!r}")
        if len(matches) > 1:
            listing = "\n".join(f"  {p[0]}" for p in matches)
            sys.exit(f"profile {selector!r} is ambiguous:\n{listing}")
        return matches[0]
    return max(profiles, key=lambda p: os.path.getmtime(p[1]))


def snapshot(db):
    """Copy the DB and its WAL/SHM sidecars to a private temp dir.

    Firefox holds the originals open; reading them in place can fail or race.
    """
    tmp = tempfile.mkdtemp(prefix="ff-cookies-")
    os.chmod(tmp, 0o700)
    dest = os.path.join(tmp, "cookies.sqlite")
    shutil.copy2(db, dest)
    for sidecar in ("-wal", "-shm"):
        if os.path.exists(db + sidecar):
            shutil.copy2(db + sidecar, dest + sidecar)
    return tmp, dest


def read_rows(db, host, include_expired):
    now = int(time.time())
    query = (
        "SELECT host, name, value, path, expiry, isSecure, isHttpOnly "
        "FROM moz_cookies"
    )
    params = ()
    if host:
        query += " WHERE host LIKE ?"
        params = (f"%{host}%",)
    con = sqlite3.connect(db)
    try:
        rows = con.execute(query, params).fetchall()
    finally:
        con.close()
    if not include_expired:
        rows = [r for r in rows if r[4] == 0 or r[4] > now]
    return sorted(rows, key=lambda r: (r[0], r[1]))


def format_names(rows):
    print("host\tname\texpiry\tsecure\thttpOnly\tvalueLen")
    for host, name, value, _path, expiry, secure, http_only in rows:
        print(f"{host}\t{name}\t{expiry}\t{secure}\t{http_only}\t{len(value)}")


def format_header(rows):
    print("; ".join(f"{name}={value}" for _h, name, value, *_ in rows))


def format_jar(rows):
    print("# Netscape HTTP Cookie File")
    for host, name, value, path, expiry, secure, http_only in rows:
        domain = host
        if http_only:
            domain = "#HttpOnly_" + domain
        include_sub = "TRUE" if host.startswith(".") else "FALSE"
        print(
            "\t".join(
                [domain, include_sub, path, "TRUE" if secure else "FALSE",
                 str(expiry or 0), name, value]
            )
        )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", help="substring filter on the cookie host")
    parser.add_argument("--profile", help="profile path substring to select")
    parser.add_argument(
        "--format",
        choices=("names", "header", "jar"),
        default="names",
        help="names lists metadata only; header/jar include values",
    )
    parser.add_argument("--include-expired", action="store_true")
    parser.add_argument("--list", action="store_true", help="list profiles and exit")
    args = parser.parse_args()

    profiles = firefox_databases()
    if args.list:
        for profile, db in sorted(profiles):
            print(f"{profile}\t{time.ctime(os.path.getmtime(db))}")
        return

    profile, db = pick_profile(profiles, args.profile)
    tmp, snapshot_path = snapshot(db)
    try:
        rows = read_rows(snapshot_path, args.host, args.include_expired)
        print(f"# {profile} (wsl={is_wsl()})", file=sys.stderr)
        {"names": format_names, "header": format_header, "jar": format_jar}[
            args.format
        ](rows)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
