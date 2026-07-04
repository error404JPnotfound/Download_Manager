"""
config_utils.py

Shared configuration path resolution for OctoDownloader.

Fixes the "settings reset when launched via shortcut" bug by ensuring
the config directory resolves the same way regardless of how the app
was launched (direct run, terminal, Windows shortcut, task scheduler,
run-as, etc).

Usage (in app.py, cli_downloader.py, ytdlp_downloader.py):

    from config_utils import get_config_dir

    CONFIG_DIR = get_config_dir()
"""

import os
import sys
import shutil
from pathlib import Path


def get_config_dir() -> Path:
    """
    Resolve the OctoDownloader config directory consistently.

    Resolution order:
      1. APPDATA environment variable (exact match).
      2. APPDATA environment variable (case-insensitive match), in case
         a launcher mangles env var casing.
      3. Manually constructed standard path:
         - Windows: ~/AppData/Roaming
         - macOS/Linux: $XDG_CONFIG_HOME, else ~/.config

    After resolving the correct path, checks for and migrates any
    legacy config that was previously saved to the wrong fallback
    location (~/OctoDownloader) due to the old buggy logic.
    """
    appdata = os.environ.get("APPDATA")

    if not appdata:
        for key, val in os.environ.items():
            if key.upper() == "APPDATA":
                appdata = val
                break

    if not appdata:
        if sys.platform == "win32":
            appdata = os.path.join(os.path.expanduser("~"), "AppData", "Roaming")
        else:
            appdata = os.environ.get("XDG_CONFIG_HOME")
            if not appdata:
                appdata = os.path.join(os.path.expanduser("~"), ".config")

    config_dir = Path(appdata) / "OctoDownloader"
    _migrate_legacy_config(config_dir)
    config_dir.mkdir(parents=True, exist_ok=True)
    return config_dir


def _migrate_legacy_config(new_config_dir: Path) -> None:
    """
    One-time migration: if a user previously had settings saved under
    the old buggy fallback path (~/OctoDownloader, from Path.home()),
    copy them into the correct location so settings/theme/history
    don't appear to reset after upgrading.

    Safe by design:
      - Only copies, never deletes the old folder.
      - Only runs if the new config dir doesn't already exist.
      - Never raises; logs a warning and lets the app continue.
    """
    legacy_dir = Path.home() / "OctoDownloader"

    if legacy_dir == new_config_dir:
        return  # old and new paths are the same, nothing to migrate

    if legacy_dir.exists() and not new_config_dir.exists():
        try:
            new_config_dir.parent.mkdir(parents=True, exist_ok=True)
            shutil.copytree(legacy_dir, new_config_dir)
            print(
                f"[OctoDownloader] Migrated legacy config from "
                f"{legacy_dir} to {new_config_dir}"
            )
        except Exception as e:
            print(f"[OctoDownloader] Warning: could not migrate legacy config: {e}")
