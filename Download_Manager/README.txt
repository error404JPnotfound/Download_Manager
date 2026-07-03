# OctoDownloader – Premium Download Manager

## How to run
1. Download and unzip `OctoDownloader.zip`.
2. Double‑click `OctoDownloader.exe`. The app will create its configuration folder automatically at `%APPDATA%\OctoDownloader\` and use your default **Downloads** folder as the target directory.

## Features
- Drag‑and‑drop URLs (or a .txt file with URLs) into the link box.
- Download queue with pause / resume / stop + confirmation modal.
- History tab that records completed, cancelled, or deleted downloads.
- Light/Dark mode toggle, fluid animations, and glass‑morphism UI.

## System requirements
- Windows 10/11 (64‑bit). No additional software required – the executable bundles a Python interpreter and all dependencies.

## Updating
Replace the old `OctoDownloader.exe` with the new one from a newer release. All settings and history are kept in `%APPDATA%\OctoDownloader`.

## Building from source (optional)
If you want to rebuild the app yourself:
1. Install Python 3.14+.
2. `pip install -r requirements.txt` (install `pywebview`, `pyinstaller`, etc.).
3. Run:
   ```
   python -m PyInstaller --onefile --windowed --name="OctoDownloader" --add-data "web;web" app.py
   ```
   The compiled binary will appear in `dist\OctoDownloader.exe`.

Enjoy!
