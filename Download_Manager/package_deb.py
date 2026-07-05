import os
import shutil
import zipfile
from pathlib import Path
from PIL import Image, ImageDraw

def generate_icon(path):
    print(f"Generating custom icon at: {path}")
    # Size 256x256
    img = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Background: dark indigo circle with bright indigo border
    draw.ellipse([8, 8, 248, 248], fill=(18, 18, 35, 255), outline=(99, 102, 241, 255), width=8)
    
    # Inner accent circle
    draw.ellipse([24, 24, 232, 232], fill=(24, 24, 48, 255))
    
    # Draw download arrow stem (white)
    draw.rectangle([116, 60, 140, 150], fill=(255, 255, 255, 255))
    
    # Draw download arrow head (neon indigo)
    draw.polygon([(88, 150), (168, 150), (128, 190)], fill=(99, 102, 241, 255))
    
    # Draw arrow head border (white) for contrast
    draw.line([(88, 150), (128, 190), (168, 150)], fill=(255, 255, 255, 255), width=3)
    
    # Base horizontal tray
    draw.rounded_rectangle([70, 205, 186, 217], radius=4, fill=(255, 255, 255, 255))
    
    # Save the icon
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, "PNG")

def main():
    base_dir = Path(__file__).resolve().parent
    build_root = base_dir / "rocketdl_1.0.0-1_all"
    
    # Clean old build root if it exists
    if build_root.exists():
        print(f"Cleaning existing directory: {build_root}")
        shutil.rmtree(build_root)
        
    print(f"Creating Debian package layout under: {build_root}")
    
    # Define directories
    debian_dir = build_root / "DEBIAN"
    bin_dir = build_root / "usr" / "bin"
    share_app_dir = build_root / "usr" / "share" / "rocketdl"
    desktop_dir = build_root / "usr" / "share" / "applications"
    pixmaps_dir = build_root / "usr" / "share" / "pixmaps"
    
    for d in [debian_dir, bin_dir, share_app_dir, desktop_dir, pixmaps_dir]:
        d.mkdir(parents=True, exist_ok=True)
        
    # Copy the Python source code and web directory
    print("Copying python source files and web assets to package layout...")
    for filename in ["app.py", "cli_downloader.py", "ytdlp_downloader.py"]:
        shutil.copy2(base_dir / filename, share_app_dir / filename)
        
    # Copy web assets
    dest_web = share_app_dir / "web"
    if dest_web.exists():
        shutil.rmtree(dest_web)
    shutil.copytree(base_dir / "web", dest_web)
    
    # Create the launcher script in /usr/bin/rocketdl
    launcher_path = bin_dir / "rocketdl"
    print(f"Creating launcher script at: {launcher_path}")
    launcher_content = """#!/bin/bash
# Launcher script for Rocket DL
VENV_DIR="$HOME/.local/share/rocketdl/venv"

if [ ! -d "$VENV_DIR" ]; then
    if command -v zenity >/dev/null 2>&1; then
        (
            echo "10" ; echo "# Initializing virtual environment..."
            python3 -m venv --system-site-packages "$VENV_DIR" >/dev/null 2>&1
            echo "40" ; echo "# Installing application packages (pywebview, nodriver, yt-dlp)..."
            "$VENV_DIR/bin/pip" install pywebview nodriver yt-dlp >/dev/null 2>&1
            echo "100" ; echo "# Setup complete! Launching Rocket DL..."
        ) | zenity --progress --title="Rocket DL Setup" --text="Initializing application..." --percentage=0 --auto-close --width=450
    else
        echo "First-time setup: Initializing virtual environment for Rocket DL..."
        python3 -m venv --system-site-packages "$VENV_DIR"
        echo "Installing required Python dependencies..."
        "$VENV_DIR/bin/pip" install pywebview nodriver yt-dlp
    fi
fi

exec "$VENV_DIR/bin/python3" /usr/share/rocketdl/app.py "$@"
"""
    launcher_path.write_text(launcher_content, encoding="utf-8")
    os.chmod(launcher_path, 0o755)
    
    # Generate the application icon
    icon_path = pixmaps_dir / "rocketdl.png"
    generate_icon(str(icon_path))
    
    # Create the Desktop entry file
    desktop_path = desktop_dir / "rocketdl.desktop"
    print(f"Creating desktop entry at: {desktop_path}")
    desktop_content = """[Desktop Entry]
Version=1.0
Type=Application
Name=Rocket DL
Comment=Premium Download Manager with PyWebView GUI
Exec=/usr/bin/rocketdl
Icon=rocketdl
Terminal=false
Categories=Network;Utility;
StartupNotify=true
"""
    desktop_path.write_text(desktop_content, encoding="utf-8")
    os.chmod(desktop_path, 0o644)
    
    # Create DEBIAN/control file
    control_path = debian_dir / "control"
    print(f"Creating DEBIAN control file at: {control_path}")
    control_content = """Package: rocketdl
Version: 1.0.0-1
Section: net
Priority: optional
Architecture: all
Maintainer: Rocket DL Team <support@rocketdl.com>
Depends: python3, python3-venv, python3-gi, gir1.2-webkit2-4.0 | gir1.2-webkit2-4.1, chromium | google-chrome-stable, zenity, ffmpeg, nodejs
Description: Rocket DL - Premium Download Manager
 A beautiful download manager featuring glass-morphic UI, pausing/resuming,
 link dragging and dropping, history, and video downloading.
"""
    control_path.write_text(control_content, encoding="utf-8")
    os.chmod(control_path, 0o644)
    
    # ------------------------------------------------------------------ #
    # Build the .deb file using dpkg-deb (Linux) or fall back to a zip  #
    # staging bundle that can be built on Kali / any Debian-based system #
    # ------------------------------------------------------------------ #
    import subprocess
    import platform

    deb_filename = "rocketdl_1.0.0-1_all.deb"
    deb_out_path = base_dir.parent / deb_filename

    # Create README_KALI.txt (always)
    readme_path = base_dir.parent / "README_KALI.txt"
    readme_content = """# Rocket DL for Kali Linux / Debian

Thank you for choosing Rocket DL! This directory contains the packaged version
of the app for Kali Linux (and other Debian-based distributions like Ubuntu/Debian).

## Installation

To install the .deb package, run the following command in your terminal:

    sudo dpkg -i rocketdl_1.0.0-1_all.deb

If there are missing dependencies (e.g. Chrome/Chromium or WebKit2 runtime), run:

    sudo apt-get install -f

## How to Run

Once installed, you can launch Rocket DL in two ways:
 1. Search for "Rocket DL" in your Desktop Application Menu.
 2. Run the command `rocketdl` directly from any terminal.

Enjoy downloading!
"""
    readme_path.write_text(readme_content, encoding="utf-8")
    print(f"README_KALI.txt created at: {readme_path}")

    # Try dpkg-deb (works natively on Linux / WSL)
    dpkg_available = False
    try:
        probe = subprocess.run(
            ["dpkg-deb", "--version"],
            capture_output=True,
            text=True
        )
        dpkg_available = (probe.returncode == 0)
    except FileNotFoundError:
        dpkg_available = False

    zip_path = base_dir.parent / "Rocket DL_Kali_Linux.zip"

    if dpkg_available:
        print("Building Debian package with dpkg-deb...")
        result = subprocess.run(
            ["dpkg-deb", "--build", "--root-owner-group", str(build_root), str(deb_out_path)],
            capture_output=True,
            text=True
        )
        if result.returncode != 0:
            print(f"dpkg-deb stdout: {result.stdout}")
            print(f"dpkg-deb stderr: {result.stderr}")
            raise RuntimeError("dpkg-deb failed to build the package")

        print(f"Debian package built successfully: {deb_out_path}")

        # Zip the finished .deb + README
        print(f"Creating ZIP archive at: {zip_path}")
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            zipf.write(deb_out_path, arcname=deb_filename)
            zipf.write(readme_path, arcname="README_KALI.txt")

        print(f"ZIP package created successfully: {zip_path}")

    else:
        # ---- Windows / no dpkg-deb fallback ----
        print()
        print("=" * 60)
        print("NOTE: dpkg-deb not found (you are likely on Windows).")
        print("Creating a staging ZIP bundle instead.")
        print("Transfer the ZIP to your Kali VM and run build_deb.sh")
        print("=" * 60)
        print()

        # Write a helper shell script that builds the .deb on Linux
        build_sh_path = base_dir.parent / "build_deb.sh"
        build_sh_content = """#!/usr/bin/env bash
# Run this script on Kali Linux / any Debian-based system to produce the .deb
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_ROOT="$SCRIPT_DIR/rocketdl_1.0.0-1_all"
DEB_OUT="$SCRIPT_DIR/rocketdl_1.0.0-1_all.deb"

echo "Building: $DEB_OUT"
dpkg-deb --build --root-owner-group "$BUILD_ROOT" "$DEB_OUT"
echo "Done! Install with: sudo dpkg -i rocketdl_1.0.0-1_all.deb"
"""
        build_sh_path.write_text(build_sh_content, encoding="utf-8")
        print(f"build_deb.sh written at: {build_sh_path}")

        # Bundle the staging directory + README + build_sh into the ZIP
        print(f"Creating staging ZIP archive at: {zip_path}")
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            # Walk the entire staging directory tree
            for item in build_root.rglob("*"):
                arcname = item.relative_to(base_dir.parent)
                zipf.write(item, arcname=str(arcname))
            # Add helpers at the root of the zip
            zipf.write(readme_path, arcname="README_KALI.txt")
            zipf.write(build_sh_path, arcname="build_deb.sh")

        print()
        print(f"Staging ZIP created: {zip_path}")
        print()
        print("Next steps:")
        print("  1. Copy Rocket DL_Kali_Linux.zip to your Kali VM")
        print("  2. Run:  unzip Rocket DL_Kali_Linux.zip")
        print("  3. Run:  chmod +x build_deb.sh && ./build_deb.sh")
        print("  4. Run:  sudo dpkg -i rocketdl_1.0.0-1_all.deb")
    
if __name__ == "__main__":
    main()
