import os
import shutil
import zipfile
from pathlib import Path

def create_mac_package():
    base_dir = Path(__file__).resolve().parent
    staging_dir = base_dir / "mac_staging"
    zip_path = base_dir / "Sharing" / "RocketDL-macOS.zip"
    
    print("Preparing macOS staging directory...")
    if staging_dir.exists():
        shutil.rmtree(staging_dir)
    staging_dir.mkdir(parents=True)
    
    # Files to copy
    files_to_copy = [
        "app.py",
        "cli_downloader.py",
        "config_utils.py",
        "ytdlp_downloader.py",
        "RocketDL.ico",
        "RocketDL.spec"
    ]
    
    dirs_to_copy = [
        "web"
    ]
    
    for f in files_to_copy:
        src = base_dir / f
        if src.exists():
            shutil.copy2(src, staging_dir / f)
            
    for d in dirs_to_copy:
        src = base_dir / d
        if src.exists():
            shutil.copytree(src, staging_dir / d)
            
    # Create build_mac.command
    build_script = staging_dir / "build_mac.command"
    script_content = """#!/bin/bash
cd "$(dirname "$0")"

echo "==========================================="
echo " Rocket DL - macOS Build Setup"
echo "==========================================="

echo "Checking for Python 3..."
if ! command -v python3 &> /dev/null
then
    echo "Python 3 could not be found. Please install Python 3."
    exit
fi

echo "Creating virtual environment..."
python3 -m venv venv
source venv/bin/activate

echo "Installing requirements..."
pip install --upgrade pip wheel setuptools
pip install pywebview yt-dlp pyinstaller Pillow nodriver

echo "Building Rocket DL.app..."
pyinstaller --windowed --icon=RocketDL.ico --name="Rocket DL" --add-data="web:web" --clean app.py

echo "Build complete! You can find 'Rocket DL.app' in the 'dist' folder."
echo "You can safely move 'Rocket DL.app' to your Applications folder."
"""
    with open(build_script, "w", newline="\n") as f:
        f.write(script_content)
        
    print("Creating ZIP archive...")
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(staging_dir):
            for file in files:
                file_path = Path(root) / file
                arcname = file_path.relative_to(staging_dir)
                zipf.write(file_path, arcname)
                
    print(f"macOS bundle created successfully at: {zip_path}")
    
    # Cleanup staging
    shutil.rmtree(staging_dir)

if __name__ == "__main__":
    create_mac_package()
