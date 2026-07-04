import os
import sys
import json
from pathlib import Path

# Try to import yt_dlp, catch if missing
try:
    import yt_dlp
except ImportError:
    print("=" * 60)
    print("Error: The 'yt-dlp' library is not installed in your Python environment.")
    print("Please install it by running the following command in your terminal:")
    print("   pip install yt-dlp")
    print("=" * 60)
    sys.exit(1)

def get_config_dir():
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
    return Path(appdata) / "OctoDownloader"

CONFIG_DIR = get_config_dir()
CONFIG_FILE = CONFIG_DIR / "config.json"

# Formatter helper functions
def format_bytes(bytes_count, decimals=2):
    if not bytes_count or bytes_count <= 0:
        return '0 Bytes'
    k = 1024
    dm = decimals if decimals >= 0 else 0
    sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
    import math
    i = int(math.floor(math.log(bytes_count) / math.log(k)))
    return f"{float(bytes_count / math.pow(k, i)):.{dm}f} {sizes[i]}"

def format_speed(bytes_per_sec):
    if not bytes_per_sec or bytes_per_sec <= 0:
        return '0 KB/s'
    return f"{format_bytes(bytes_per_sec, 1)}/s"

def get_default_download_dir():
    default_dir = Path.home() / "Downloads"
    if not default_dir.exists():
        default_dir = Path.home()
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                cfg = json.load(f)
                path = cfg.get("download_path")
                if path and Path(path).exists():
                    return Path(path)
        except Exception:
            pass
    return default_dir

def ytdlp_progress_hook(d):
    if d['status'] == 'downloading':
        downloaded = d.get('downloaded_bytes', 0)
        total = d.get('total_bytes') or d.get('total_bytes_estimate', 0)
        speed = d.get('speed', 0.0)
        eta = d.get('eta')
        
        percent = 0.0
        if total > 0:
            percent = (downloaded / total) * 100
            
        bar_length = 30
        filled_length = int(bar_length * percent // 100)
        bar = '=' * filled_length + '-' * (bar_length - filled_length)
        
        speed_str = format_speed(speed)
        size_str = f"{format_bytes(downloaded)} / {format_bytes(total)}" if total > 0 else f"{format_bytes(downloaded)}"
        eta_str = f"{eta}s" if eta is not None else "Unknown"
        
        sys.stdout.write(f"\rProgress: [{bar}] {percent:.1f}% | {size_str} | Speed: {speed_str} | ETA: {eta_str}    ")
        sys.stdout.flush()
        
    elif d['status'] == 'finished':
        sys.stdout.write("\n[System] Media download complete. Running merger/post-processor...\n")
        sys.stdout.flush()

def download_video(url, download_dir, quality_choice):
    # Set download options based on choice
    ydl_opts = {
        'outtmpl': os.path.join(str(download_dir), '%(title)s.%(ext)s'),
        'progress_hooks': [ytdlp_progress_hook],
        'quiet': True,
        'no_warnings': True,
    }
    
    # 1: Best Quality, 2: 1080p60, 3: 1080p30, 4: 720p60, 5: 720p30, 6: Audio MP3
    if quality_choice == '1':
        # Best video + best audio merged (handles up to 4K/8K 60fps)
        ydl_opts['format'] = 'bestvideo+bestaudio/best'
        ydl_opts['merge_output_format'] = 'mp4'
    elif quality_choice == '2':
        # 1080p up to 60fps
        ydl_opts['format'] = 'bestvideo[height<=1080][fps<=60]+bestaudio/best[height<=1080]'
        ydl_opts['merge_output_format'] = 'mp4'
    elif quality_choice == '3':
        # 1080p capped at 30fps
        ydl_opts['format'] = 'bestvideo[height<=1080][fps<=30]+bestaudio/best[height<=1080]'
        ydl_opts['merge_output_format'] = 'mp4'
    elif quality_choice == '4':
        # 720p up to 60fps
        ydl_opts['format'] = 'bestvideo[height<=720][fps<=60]+bestaudio/best[height<=720]'
        ydl_opts['merge_output_format'] = 'mp4'
    elif quality_choice == '5':
        # 720p capped at 30fps
        ydl_opts['format'] = 'bestvideo[height<=720][fps<=30]+bestaudio/best[height<=720]'
        ydl_opts['merge_output_format'] = 'mp4'
    elif quality_choice == '6':
        # Audio extraction
        ydl_opts['format'] = 'bestaudio/best'
        ydl_opts['postprocessors'] = [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }]
    else:
        print("[System] Invalid format option. Defaulting to Best combined...")
        ydl_opts['format'] = 'bestvideo+bestaudio/best'
        ydl_opts['merge_output_format'] = 'mp4'

    print(f"\n[System] Initializing connection to video server...")
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            # Extract metadata first
            info = ydl.extract_info(url, download=False)
            title = info.get('title', 'Unknown Title')
            duration = info.get('duration', 0)
            
            # Print video info
            print("-" * 50)
            print(f"Title:    {title}")
            if duration:
                mins = duration // 60
                secs = duration % 60
                print(f"Duration: {mins}m {secs}s")
            print("-" * 50)
            
            # Start download
            ydl.download([url])
            print("[System] Download task completed successfully!")
            return True
    except Exception as e:
        print(f"\n[Error] yt-dlp download failed: {str(e)}")
        print("[Tip] Ensure you have 'ffmpeg' installed on your system path for merging formats or extracting MP3s.")
        return False

def main():
    print("=" * 60)
    print("         OCTODOWNLOADER - yt-dlp TERMINAL EDITION")
    print("=" * 60)
    
    # 1. Resolve Save Location
    default_dir = get_default_download_dir()
    print(f"Default Save Path: {default_dir}")
    path_input = input("Press ENTER to use default, or enter custom path: ").strip()
    download_dir = Path(path_input) if path_input else default_dir
    download_dir.mkdir(parents=True, exist_ok=True)
    print(f"Using Directory: {download_dir.resolve()}")
    
    # 2. Select Quality / Format
    print("\nSelect Download Quality & Format:")
    print("  1) Best Quality Combined (Up to 4K/60fps - Default)")
    print("  2) 1080p at 60fps (or best available)")
    print("  3) 1080p at 30fps (saves disk space)")
    print("  4) 720p at 60fps (or best available)")
    print("  5) 720p at 30fps (saves disk space)")
    print("  6) Audio Only extraction (mp3)")
    choice = input("Enter choice (1-6): ").strip()
    if not choice:
        choice = '1'
        
    # 3. Enter URL
    url = input("\nEnter YouTube or video URL: ").strip()
    if not url:
        print("[System] Empty URL entered. Exiting...")
        return
        
    download_video(url, download_dir, choice)

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\n[System] Process aborted by user. Exiting...")
