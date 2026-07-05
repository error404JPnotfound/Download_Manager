#!/usr/bin/env bash
# Run this script on Kali Linux / any Debian-based system to produce the .deb
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_ROOT="$SCRIPT_DIR/Download_Manager/rocketdl_1.0_amd64"
DEB_OUT="$SCRIPT_DIR/Download_Manager/Sharing/rocketdl_1.0_amd64.deb"

echo "Building: $DEB_OUT"
dpkg-deb --build --root-owner-group "$BUILD_ROOT" "$DEB_OUT"
echo "Done! Install with: sudo dpkg -i Download_Manager/Sharing/rocketdl_1.0_amd64.deb"
