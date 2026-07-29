---
name: mariadb-upgrades-need-auto-upgrade-env
description: Bumping the mariadb image tag does nothing to system tables unless MARIADB_AUTO_UPGRADE is set on the container
metadata: 
  node_type: memory
  type: project
  originSessionId: 98e6e913-c748-4676-92ad-94d3e2352e1b
  modified: 2026-07-29T01:37:36.272Z
---

The official mariadb image only runs `mariadb-upgrade` when **`MARIADB_AUTO_UPGRADE`** is set — it is the one environment variable that still has any effect on a container whose data directory is already populated. Without it, a tag bump starts new binaries against old system tables, which surfaces as `Incorrect definition of table mysql.*`. The DB container also carries `watchtower.enable=false`, so it never auto-updates and drifts behind the repo silently.

**Why:** on 2026-07-29 the server was found running `mariadb:12.0.2` while the repo's compose had been bumped to `12.3.2` by Renovate — two release series of drift that nobody had noticed. In MariaDB's versioning the *second* digit is the major version, so 12.0 → 12.3 is three major steps, not a patch. Skipping intermediate majors is supported, and 12.1/12.2 list no backward-incompatible changes at all, so the whole breaking surface was 12.3's (reserved words `CONVERSION`/`ST_COLLECT`/`TO_DATE`, removed `big_tables`/`large_page_size`/`storage_engine`) — none of which this schema touches.

**How to apply:** before rolling a mariadb bump, confirm `MARIADB_AUTO_UPGRADE=1` is on the service, take a timestamped `--all-databases` dump (via `docker exec ... sh -c` referencing `$MYSQL_ROOT_PASSWORD` **inside** the container, so the credential is never read out), and copy it off the host before bouncing. `scripts/backup.sh` is not suitable — it writes a fixed filename and overwrites the previous backup. The upgrade also writes its own `system_mysql_backup_<oldversion>.sql.zst` into the datadir.
