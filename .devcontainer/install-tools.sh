#!/usr/bin/env bash
set -euo pipefail

GITLEAKS_VERSION=8.30.1
GITLEAKS_SHA256_ARM64=e4a487ee7ccd7d3a7f7ec08657610aa3606637dab924210b3aee62570fb4b080
GITLEAKS_SHA256_X64=551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb

case "$(uname -m)" in
  aarch64|arm64) ARCH=arm64; SHA256=$GITLEAKS_SHA256_ARM64 ;;
  *) ARCH=x64; SHA256=$GITLEAKS_SHA256_X64 ;;
esac

curl -fsSL "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_${ARCH}.tar.gz" -o /tmp/gitleaks.tar.gz
echo "${SHA256}  /tmp/gitleaks.tar.gz" | sha256sum -c --strict
tar -xzf /tmp/gitleaks.tar.gz -C /usr/local/bin gitleaks
rm /tmp/gitleaks.tar.gz

# Pins the Compact CLI tool itself (its own release tags), not the compiler
# version in .compact-version: the two move independently.
su node -c '
  set -euo pipefail
  export COMPACT_NO_MODIFY_PATH=1
  curl --proto "=https" --tlsv1.2 -LsSf https://github.com/midnightntwrk/compact/releases/download/compact-v0.5.2/compact-installer.sh | sh
  "$HOME/.local/bin/compact" update "$(cat /workspace/.compact-version)"
'
echo 'export PATH="$HOME/.local/bin:$PATH"' > /etc/profile.d/compact.sh
