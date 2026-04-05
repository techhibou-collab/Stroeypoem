#!/usr/bin/env bash
# Run on a fresh Ubuntu 22.04/24.04 EC2 (as root or with sudo).
# Installs Docker, clones or uses an existing repo path, then starts the stack.

set -euo pipefail

REPO_DIR="${REPO_DIR:-$HOME/Stroeypoem}"
COMPOSE_CMD="docker compose --env-file deploy/ec2/.env -f docker-compose.ec2.yml"

if ! command -v docker >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${VERSION_CODENAME:-jammy}") stable" >/etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

if ! groups "$USER" 2>/dev/null | grep -q docker; then
  usermod -aG docker "$USER" || true
  echo "Added $USER to docker group. Log out and back in, or run: newgrp docker"
fi

cd "$REPO_DIR"

if [[ ! -f deploy/ec2/.env ]]; then
  echo "Missing deploy/ec2/.env — copy deploy/ec2/env.example and set passwords and NEXT_PUBLIC_API_BASE_URL."
  exit 1
fi

$COMPOSE_CMD up -d --build

echo "Stack started. Open port 3000 (UI) and 5005 (API) in the EC2 security group."
PUB_IP=""
if TOKEN=$(curl -sSf -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 60" 2>/dev/null); then
  PUB_IP=$(curl -sSf -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null) || true
fi
if [[ -z "$PUB_IP" ]]; then
  PUB_IP=$(curl -sSf http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null) || PUB_IP="YOUR_PUBLIC_IP"
fi
echo "Site: http://${PUB_IP}:3000  (set NEXT_PUBLIC_API_BASE_URL to http://${PUB_IP}:5005 before first build if not already)"
