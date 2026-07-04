#!/usr/bin/env bash
# Run this script on Kali Linux / any Debian-based system to produce the .deb
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_ROOT="$SCRIPT_DIR/octodownloader_1.0.0-1_all"
DEB_OUT="$SCRIPT_DIR/octodownloader_1.0.0-1_all.deb"

echo "Building: $DEB_OUT"
dpkg-deb --build --root-owner-group "$BUILD_ROOT" "$DEB_OUT"
echo "Done! Install with: sudo dpkg -i octodownloader_1.0.0-1_all.deb"
