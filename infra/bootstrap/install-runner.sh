#!/bin/bash
# EXTAS — install the GitHub Actions self-hosted runner on the Azure VM.
# Run ONCE as root through Azure portal → VM → Operations → Run command → RunShellScript.
# The owner replaces PASTE_TOKEN_HERE with the token from GitHub
# (repo → Settings → Actions → Runners → New self-hosted runner → the "--token" value). The token expires in 1 hour
# and is never committed anywhere.
TOKEN="PASTE_TOKEN_HERE"
REPO_URL="https://github.com/mehadih32/Extas-Ecommerce-Site"
set -euo pipefail
if [ "$TOKEN" = "PASTE_TOKEN_HERE" ] || [ -z "$TOKEN" ]; then echo "ERROR: token missing"; exit 1; fi
id ghrunner >/dev/null 2>&1 || useradd -m -s /bin/bash ghrunner
echo "ghrunner ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/90-ghrunner
chmod 440 /etc/sudoers.d/90-ghrunner
export DEBIAN_FRONTEND=noninteractive
apt-get update -y && apt-get install -y curl tar jq
D=/home/ghrunner/actions-runner
mkdir -p "$D" && cd "$D"
V=$(curl -fsSL https://api.github.com/repos/actions/runner/releases/latest | jq -r .tag_name | sed 's/^v//')
curl -fsSL -o runner.tgz "https://github.com/actions/runner/releases/download/v${V}/actions-runner-linux-x64-${V}.tar.gz"
tar xzf runner.tgz && rm -f runner.tgz
./bin/installdependencies.sh
chown -R ghrunner:ghrunner /home/ghrunner
sudo -u ghrunner ./config.sh --unattended --url "$REPO_URL" --token "$TOKEN" --name extas-vm --labels extas-vm --replace
./svc.sh install ghrunner
./svc.sh start
echo "DONE: EXTAS runner installed and running (runner ${V})"
