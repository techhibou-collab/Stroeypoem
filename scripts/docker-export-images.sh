#!/usr/bin/env bash
# Build application images and write Docker image archives (.tar) for offline transfer or registry sideload.
# Usage (from repo root):
#   ./scripts/docker-export-images.sh
#   OUT_DIR=./my-tars NEXT_PUBLIC_API_BASE_URL=https://api.example.com ./scripts/docker-export-images.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

OUT_DIR="${OUT_DIR:-$ROOT/docker-images}"
INCLUDE_DB_INIT_TOOLS="${INCLUDE_DB_INIT_TOOLS:-0}"

mkdir -p "$OUT_DIR"

echo "Building db, backend, frontend..."
docker compose build db backend frontend

echo "Saving images to $OUT_DIR ..."

docker save stroeypoem-sqlserver:2022 -o "$OUT_DIR/stroeypoem-sqlserver-2022.tar"
docker save stroeypoem-backend -o "$OUT_DIR/stroeypoem-backend.tar"
docker save stroeypoem-frontend -o "$OUT_DIR/stroeypoem-frontend.tar"

if [[ "$INCLUDE_DB_INIT_TOOLS" == "1" ]]; then
  docker pull mcr.microsoft.com/mssql-tools
  docker save mcr.microsoft.com/mssql-tools -o "$OUT_DIR/mssql-tools.tar"
  echo "Also wrote mssql-tools.tar (for db-init / schema apply offline)."
fi

ls -lh "$OUT_DIR"/*.tar
echo "Done. Load on another host with: docker load -i <file>.tar"
