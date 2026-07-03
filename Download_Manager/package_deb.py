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
    build_root = base_dir / "octodownloader_1.0.0-1_all"
    
    # Clean old build root if it exists
    if build_root.exists():
        print(f"Cleaning existing directory: {build_root}")
        shutil.rmtree(build_root)
        
    print(f"Creating Debian package layout under: {build_root}")
    
    # Define directories
    debian_dir = build_root / "DEBIAN"
    bin_dir = build_root / "usr" / "bin"
    share_app_dir = build_root / "usr" / "share" / "octodownloader"
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
    
    # Create the launcher script in /usr/bin/octodownloader
    launcher_path = bin_dir / "octodownloader"
    print(f"Creating launcher script at: {launcher_path}")
    launcher_content = """#!/bin/bash
# Launcher script for OctoDownloader
VENV_DIR="$HOME/.local/share/octodownloader/venv"

if [ ! -d "$VENV_DIR" ]; then
    if command -v zenity >/dev/null 2>&1; then
        (
            echo "10" ; echo "# Initializing virtual environment..."
            python3 -m venv --system-site-packages "$VENV_DIR" >/dev/null 2>&1
            echo "40" ; echo "# Installing application packages (pywebview, nodriver, yt-dlp)..."
            "$VENV_DIR/bin/pip" install pywebview nodriver yt-dlp >/dev/null 2>&1
            echo "100" ; echo "# Setup complete! Launching OctoDownloader..."
        ) | zenity --progress --title="OctoDownloader Setup" --text="Initializing application..." --percentage=0 --auto-close --width=450
    else
        echo "First-time setup: Initializing virtual environment for OctoDownloader..."
        python3 -m venv --system-site-packages "$VENV_DIR"
        echo "Installing required Python dependencies..."
        "$VENV_DIR/bin/pip" install pywebview nodriver yt-dlp
    fi
fi

exec "$VENV_DIR/bin/python3" /usr/share/octodownloader/app.py "$@"
"""
    launcher_path.write_text(launcher_content, encoding="utf-8")
    os.chmod(launcher_path, 0o755)
    
    # Generate the application icon
    icon_path = pixmaps_dir / "octodownloader.png"
    generate_icon(str(icon_path))
    
    # Create the Desktop entry file
    desktop_path = desktop_dir / "octodownloader.desktop"
    print(f"Creating desktop entry at: {desktop_path}")
    desktop_content = """[Desktop Entry]
Version=1.0
Type=Application
Name=OctoDownloader
Comment=Premium Download Manager with PyWebView GUI
Exec=/usr/bin/octodownloader
Icon=octodownloader
Terminal=false
Categories=Network;Utility;
StartupNotify=true
"""
    desktop_path.write_text(desktop_content, encoding="utf-8")
    os.chmod(desktop_path, 0o644)
    
    # Create DEBIAN/control file
    control_path = debian_dir / "control"
    print(f"Creating DEBIAN control file at: {control_path}")
    control_content = """Package: octodownloader
Version: 1.0.0-1
Section: net
Priority: optional
Architecture: all
Maintainer: OctoDownloader Team <support@octodownloader.com>
Depends: python3, python3-venv, python3-gi, gir1.2-webkit2-4.0 | gir1.2-webkit2-4.1, chromium | google-chrome-stable, zenity, ffmpeg, nodejs
Description: OctoDownloader - Premium Download Manager
 A beautiful download manager featuring glass-morphic UI, pausing/resuming,
 link dragging and dropping, history, and video downloading.
"""
    control_path.write_text(control_content, encoding="utf-8")
    os.chmod(control_path, 0o644)
    
    # Build the .deb file using dpkg-deb
    print("Building debian package with dpkg-deb...")
    deb_filename = "octodownloader_1.0.0-1_all.deb"
    deb_out_path = base_dir.parent / deb_filename
    
    import subprocess
    result = subprocess.run(
        ["dpkg-deb", "--build", str(build_root), str(deb_out_path)],
        capture_output=True,
        text=True
    )
    if result.returncode != 0:
        print(f"dpkg-deb error stdout: {result.stdout}")
        print(f"dpkg-deb error stderr: {result.stderr}")
        raise RuntimeError("dpkg-deb failed to build the package")
        
    print(f"Debian package built successfully: {deb_out_path}")
    
    # Create README_KALI.txt
    readme_path = base_dir.parent / "README_KALI.txt"
    readme_content = """# OctoDownloader for Kali Linux / Debian
 
Thank you for choosing OctoDownloader! This directory contains the packaged version of the app for Kali Linux (and other Debian-based distributions like Ubuntu/Debian).
 
## Installation
 
To install the `.deb` package, run the following command in your terminal:
 
    sudo dpkg -i octodownloader_1.0.0-1_all.deb
 
If there are missing dependencies (e.g. Chrome/Chromium or WebKit2 runtime), run:
 
    sudo apt-get install -f
 
## How to Run
 
Once installed, you can launch OctoDownloader in two ways:
 1. Search for "OctoDownloader" in your Desktop Application Menu.
 2. Run the command `octodownloader` directly from any terminal.
 
Enjoy downloading!
"""
    readme_path.write_text(readme_content, encoding="utf-8")
    print(f"README_KALI.txt created at: {readme_path}")
    
    # Zip the .deb and the README
    zip_path = base_dir.parent / "OctoDownloader_Kali_Linux.zip"
    print(f"Creating ZIP archive at: {zip_path}")
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        zipf.write(deb_out_path, arcname=deb_filename)
        zipf.write(readme_path, arcname="README_KALI.txt")
        
    print(f"ZIP package created successfully at: {zip_path}")
    
if __name__ == "__main__":
    main()
