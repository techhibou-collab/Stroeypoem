# DevOps handoff — Docker stack (SQL Server + backend + frontend)

The application uses **Microsoft SQL Server** (T-SQL). There is no MySQL service; migrating would require rewriting the backend and schema.

## Dockerfiles (three images)

| Service    | Path                         | Compose image name (typical)   |
|------------|------------------------------|--------------------------------|
| Database   | `docker/sqlserver/Dockerfile` | `stroeypoem-sqlserver:2022`    |
| API (Node) | `backend/Dockerfile`         | `stroeypoem-backend`           |
| Web (Next) | `frontend/Dockerfile`        | `stroeypoem-frontend`          |

Schema initialization: `db-init` uses image `mcr.microsoft.com/mssql-tools` and runs `backend/src/init.sql` (not a custom Dockerfile).

## Run the full stack

**Local / integration (from repository root):**

```bash
docker compose up -d --build
```

- UI: `http://localhost:3000`
- API: `http://localhost:5005` (default backend port)
- SQL Server is also mapped to host port **1434** in this file (for local tools).

**Single server / EC2 (DB not exposed on the host):**

```bash
cp deploy/ec2/env.example deploy/ec2/.env
# Edit deploy/ec2/.env — passwords and NEXT_PUBLIC_API_BASE_URL (browser-facing API URL)

docker compose --env-file deploy/ec2/.env -f docker-compose.ec2.yml up -d --build
```

## Build-time and runtime configuration

- **Frontend:** set `NEXT_PUBLIC_API_BASE_URL` when building (no trailing slash). In `docker-compose.yml` it defaults to `http://localhost:5005` and can be overridden with the same env var.
- **Backend:** `DB_*`, `JWT_SECRET`, `PORT` — see compose files and `deploy/ec2/env.example`.
- **SQL Server:** `MSSQL_SA_PASSWORD`, `ACCEPT_EULA`, `MSSQL_PID` — see compose files.

## Export images as `.tar` (offline / sideload)

From repository root:

```bash
./scripts/docker-export-images.sh
```

Optional: include `mssql-tools` for offline `db-init`:

```bash
INCLUDE_DB_INIT_TOOLS=1 ./scripts/docker-export-images.sh
```

Archives are written under `docker-images/` (gitignored).

## Related paths

- `docker-compose.yml` — local full stack
- `docker-compose.ec2.yml` — production-style single host
- `deploy/ec2/env.example` — template for EC2 env file
- `deploy/ec2/bootstrap.sh` — Ubuntu EC2 Docker install + compose up
- `backend/.dockerignore`, `frontend/.dockerignore` — build context exclusions
