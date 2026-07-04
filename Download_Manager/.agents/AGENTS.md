# Workspace Rules

- **Auto-Rebuild and Run**: Whenever you modify the source files (Python, HTML, JS, CSS), you must automatically:
  1. Force-terminate any running `OctoDownloader.exe` processes to release file locks.
  2. Run PyInstaller (`python -m PyInstaller --clean -y OctoDownloader.spec`) to rebuild the executable.
  3. Launch the new build (`dist\OctoDownloader.exe`) for the user.
