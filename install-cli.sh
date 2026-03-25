#!/bin/bash
# Agent Factory CLI Installer
# Downloads the correct binary for your platform and runs the install wizard.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/wolzey/agent-factory/main/install-cli.sh | bash

set -e

REPO="wolzey/agent-factory"
BINARY="agent-factory"
INSTALL_DIR="${HOME}/.local/bin"

# Detect OS and architecture
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "$ARCH" in
  x86_64)  ARCH="amd64" ;;
  aarch64) ARCH="arm64" ;;
  arm64)   ARCH="arm64" ;;
  *)
    echo "Unsupported architecture: $ARCH"
    exit 1
    ;;
esac

case "$OS" in
  darwin|linux) ;;
  *)
    echo "Unsupported OS: $OS"
    exit 1
    ;;
esac

ASSET="${BINARY}_${OS}_${ARCH}.tar.gz"

# Get latest release URL
DOWNLOAD_URL="https://github.com/${REPO}/releases/latest/download/${ASSET}"

echo ""
echo "  Agent Factory CLI Installer"
echo "  Platform: ${OS}/${ARCH}"
echo ""

# Download and extract
TMP_DIR=$(mktemp -d)
echo "  Downloading ${ASSET}..."
curl -fsSL "$DOWNLOAD_URL" -o "${TMP_DIR}/${ASSET}"
tar xzf "${TMP_DIR}/${ASSET}" -C "$TMP_DIR"

# Install binary
mkdir -p "$INSTALL_DIR"
mv "${TMP_DIR}/${BINARY}" "${INSTALL_DIR}/${BINARY}"
chmod +x "${INSTALL_DIR}/${BINARY}"
rm -rf "$TMP_DIR"

echo "  Installed to ${INSTALL_DIR}/${BINARY}"

# Check if install dir is in PATH
if ! echo "$PATH" | tr ':' '\n' | grep -q "^${INSTALL_DIR}$"; then
  echo ""
  echo "  NOTE: ${INSTALL_DIR} is not in your PATH."
  echo "  Add it with: export PATH=\"${INSTALL_DIR}:\$PATH\""
  echo ""
  # Run directly for now
  "${INSTALL_DIR}/${BINARY}" install
else
  echo ""
  "${BINARY}" install
fi
