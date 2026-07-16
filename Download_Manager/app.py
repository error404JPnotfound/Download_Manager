import sys
import os
import threading
import asyncio
import json
import time
from pathlib import Path
import urllib.request
import urllib.parse
import webview
try:
    import nodriver as uc
    from nodriver.cdp import browser as cdp_browser
    NODRIVER_AVAILABLE = True
except Exception:
    NODRIVER_AVAILABLE = False
    class DummyBrowser:
        class DownloadProgress:
            pass
    cdp_browser = DummyBrowser()
import hashlib

# Resolve the web directory path (crucial for PyInstaller packaging)
if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
    web_dir = os.path.join(sys._MEIPASS, 'web')
    base_dir = sys._MEIPASS
else:
    web_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'web')
    base_dir = os.path.dirname(os.path.abspath(__file__))

index_url = Path(os.path.join(web_dir, 'index.html')).resolve().as_uri()

# Persistent Configuration Setup
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
    return Path(appdata) / "RocketDL"

CONFIG_DIR = get_config_dir()
CONFIG_DIR.mkdir(parents=True, exist_ok=True)
CONFIG_FILE = CONFIG_DIR / "config.json"

def load_config():
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict):
                    return data
        except Exception:
            pass
    return {}

def save_config(cfg):
    try:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=4)
    except Exception:
        pass

def load_download_dir():
    default_dir = Path.home() / "Downloads"
    if not default_dir.exists():
        default_dir = Path.home()
        
    cfg = load_config()
    path = cfg.get("download_path")
    if path and Path(path).exists():
        return Path(path)
        
    # Save default if config doesn't exist/is corrupt
    cfg["download_path"] = str(default_dir)
    save_config(cfg)
    return default_dir

def save_download_dir(path_str):
    cfg = load_config()
    cfg["download_path"] = path_str
    save_config(cfg)

HISTORY_FILE = CONFIG_DIR / "history.json"

def load_history():
    if HISTORY_FILE.exists():
        try:
            with open(HISTORY_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return []

def save_history(records):
    try:
        with open(HISTORY_FILE, "w", encoding="utf-8") as f:
            json.dump(records, f, indent=4)
    except Exception:
        pass

def add_history_record(url, filename, status):
    import datetime
    try:
        records = load_history()
        new_record = {
            "url": url,
            "filename": filename or "Unknown",
            "status": status,
            "timestamp": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }
        records.insert(0, new_record)
        # Cap to last 150 items
        save_history(records[:150])
    except Exception:
        pass

# Global Application States
DOWNLOAD_DIR = load_download_dir()
is_downloading = False
is_paused = False
browser_instance = None
download_thread = None
window_instance = None
is_yt_downloading = False

# Download progress tracking variables
active_url = None
last_percent = -1
download_speed_info = {}

async def on_download_progress(event: cdp_browser.DownloadProgress):
    global active_url, last_percent, download_speed_info
    if active_url:
        now = time.time()
        received = event.received_bytes
        total = event.total_bytes
        state = event.state
        
        info = download_speed_info.get(active_url)
        if not info:
            info = {
                'last_bytes': received,
                'last_time': now,
                'speed': 0.0,
                'last_js_update_time': 0.0
            }
            download_speed_info[active_url] = info
            
        time_diff = now - info['last_time']
        if time_diff >= 0.75:  # Calculate speed every 0.75 seconds to ensure steady rates
            bytes_diff = received - info['last_bytes']
            if bytes_diff > 0 and time_diff > 0:
                info['speed'] = bytes_diff / time_diff
            else:
                info['speed'] = 0.0
            info['last_bytes'] = received
            info['last_time'] = now
            
        percent = 0
        if total > 0:
            percent = int((received / total) * 100)
            
        # Refresh the progress at most once every 0.75 seconds, BUT always send final states immediately!
        is_final_state = (state in ('completed', 'canceled')) or (percent >= 100)
        js_time_diff = now - info.get('last_js_update_time', 0.0)
        
        if is_final_state or js_time_diff >= 0.75:
            # Call JS update progress
            run_js("js_update_download_progress", active_url, state, percent, info['speed'], received, total)
            info['last_js_update_time'] = now
            
        nearest_10 = (percent // 10) * 10
        if nearest_10 > last_percent:
            run_js("js_log", "Worker", f"Download progress: {percent}% ({int(received)}/{int(total)} bytes)")
            last_percent = nearest_10

def is_direct_link(url):
    try:
        parsed = urllib.parse.urlparse(url)
        path = parsed.path.lower()
        
        # 1. Quick extension check for common media/archive files
        direct_extensions = (
            '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz',
            '.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mp3', '.wav', '.flac', '.ogg', '.m4a',
            '.pdf', '.epub', '.docx', '.xlsx', '.pptx',
            '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico',
            '.iso', '.bin'
        )
        has_direct_ext = any(path.endswith(ext) for ext in direct_extensions)
        
        # 2. Check query string for filename parameter with direct extension
        query = parsed.query.lower()
        if 'filename' in query:
            if any(ext in query for ext in direct_extensions):
                return True
        
        # 3. Check Content-Type via HEAD request first
        try:
            req = urllib.request.Request(
                url,
                method='HEAD',
                headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'}
            )
            with urllib.request.urlopen(req, timeout=4) as resp:
                content_type = resp.headers.get('Content-Type', '').lower()
                if content_type:
                    if 'text/html' in content_type:
                        return False
                    return True
        except Exception:
            pass

        # 4. Fallback: Check Content-Type via GET request with Range bytes=0-0
        try:
            req = urllib.request.Request(
                url,
                method='GET',
                headers={
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                    'Range': 'bytes=0-0'
                }
            )
            with urllib.request.urlopen(req, timeout=4) as resp:
                content_type = resp.headers.get('Content-Type', '').lower()
                if content_type:
                    if 'text/html' in content_type:
                        return False
                    return True
        except Exception:
            pass

        # 5. Fallback to direct extension matching if requests failed (e.g. rate-limit/offline)
        if has_direct_ext:
            return True
            
    except Exception:
        pass
    return False


async def download_direct_file(url, download_dir, progress_callback, log_callback):
    global is_downloading, is_paused
    import hashlib
    try:
        # Create a unique temp file path based on URL hash to persist state reliably
        url_hash = hashlib.md5(url.encode('utf-8')).hexdigest()
        temp_dest = Path(download_dir) / f".rocket_{url_hash}.tmp"
        
        start_bytes = 0
        is_resume = False
        if temp_dest.exists():
            start_bytes = temp_dest.stat().st_size
            is_resume = True
            log_callback("System", f"Resuming download from byte {start_bytes}...")
        else:
            log_callback("System", "Direct link detected. Initializing fast HTTP download...")

        req = urllib.request.Request(
            url,
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
        )
        if start_bytes > 0:
            req.add_header('Range', f'bytes={start_bytes}-')

        loop = asyncio.get_event_loop()
        
        def blocking_download():
            global is_downloading, is_paused
            nonlocal is_resume, start_bytes
            try:
                # Open request
                # To handle 206 Partial Content or 200 OK correctly:
                # urllib might raise HTTPError 416 if the range is invalid/fully completed
                try:
                    ctx = urllib.request.urlopen(req, timeout=20)
                except Exception as he:
                    if is_resume:
                        log_callback("Worker", f"Range request failed ({str(he)}). Re-fetching download from scratch...")
                        if req.has_header('Range'):
                            req.remove_header('Range')
                        is_resume = False
                        start_bytes = 0
                        ctx = urllib.request.urlopen(req, timeout=20)
                    else:
                        raise he
                
                with ctx as response:
                    content_type = response.headers.get('Content-Type', '').lower()
                    if 'text/html' in content_type:
                        raise ValueError("Target URL returned an HTML webpage instead of a binary file.")
                    
                    status_code = response.getcode()
                    mode = 'ab' if (status_code == 206 and is_resume) else 'wb'
                    
                    if mode == 'wb':
                        received_bytes = 0
                        total_bytes = int(response.headers.get('Content-Length', 0))
                    else:
                        received_bytes = start_bytes
                        total_bytes = int(response.headers.get('Content-Length', 0)) + start_bytes
                    
                    # Resolve final filename
                    filename = "downloaded_file"
                    content_disposition = response.headers.get('Content-Disposition', '')
                    if 'filename=' in content_disposition:
                        parts = content_disposition.split('filename=')
                        if len(parts) > 1:
                            filename = parts[1].strip('\'" ')
                    else:
                        parsed = urllib.parse.urlparse(url)
                        guessed = os.path.basename(parsed.path)
                        if guessed:
                            filename = guessed
                    
                    dest_path = Path(download_dir) / filename
                    
                    log_callback("Worker", f"Saving file as: {filename}")
                    
                    with open(temp_dest, mode) as out_file:
                        while is_downloading:
                            chunk = response.read(1024 * 64)
                            if not chunk:
                                break
                            out_file.write(chunk)
                            received_bytes += len(chunk)
                            
                            loop.call_soon_threadsafe(
                                progress_callback,
                                received_bytes,
                                total_bytes,
                                'downloading',
                                filename
                            )
                
                # Check outcome
                if not is_downloading:
                    if temp_dest.exists():
                        temp_dest.unlink(missing_ok=True)
                    raise InterruptedError("Cancelled by user")
                
                # If completed successfully, rename it
                # Deduplicate destination path
                base_name = dest_path.stem
                suffix = dest_path.suffix
                counter = 1
                while dest_path.exists():
                    dest_path = Path(download_dir) / f"{base_name}_{counter}{suffix}"
                    counter += 1
                
                if temp_dest.exists():
                    temp_dest.rename(dest_path)
                
                loop.call_soon_threadsafe(
                    progress_callback,
                    total_bytes,
                    total_bytes,
                    'completed',
                    dest_path.name
                )
                return dest_path.name

            except Exception as e:
                raise e

        result = await loop.run_in_executor(None, blocking_download)
        log_callback("System", f"Direct download finished: {result}")
        return True
    except Exception as e:
        log_callback("Error", f"Direct download failed: {str(e)}")
        return False

# Helper to thread-safely call JS in the pywebview window
def run_js(func, *args):
    global window_instance
    if window_instance:
        serialized = []
        for arg in args:
            if arg is None:
                serialized.append('null')
            elif isinstance(arg, bool):
                serialized.append('true' if arg else 'false')
            elif isinstance(arg, (int, float)):
                serialized.append(str(arg))
            else:
                # Escape strings safely
                escaped = str(arg).replace('\\', '\\\\').replace("'", "\\'").replace('\n', '\\n').replace('\r', '\\r')
                serialized.append(f"'{escaped}'")
        js_code = f"{func}({', '.join(serialized)})"
        window_instance.evaluate_js(js_code)

async def download_worker(urls, headless):
    global is_downloading, browser_instance, DOWNLOAD_DIR, is_paused
    is_downloading = True
    
    # Notify JS that downloads started
    run_js("js_on_downloads_started")
    
    try:
        run_js("js_log", "System", "Launching browser...")
        
        if not NODRIVER_AVAILABLE:
            run_js("js_log", "Error", "The high-speed downloader requires Python 3.10+ (nodriver) on macOS. Please update Python or use yt-dlp links instead.")
            is_downloading = False
            return

        # Configure Chrome arguments for stealth, stability, and popup handling
        args = [
            "--disable-popup-blocking",
            "--window-size=1920,1080",
            "--disable-gpu",
            "--no-sandbox",
        ]
        # In headless mode, spoof user agent to prevent anti-bot detection
        if headless:
            args.append("--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
            args.append("--window-position=-10000,-10000")

        # Start browser using nodriver
        browser = await uc.start(headless=headless, browser_args=args)
        browser_instance = browser
        
        # Register progress listener on browser
        browser.add_handler(cdp_browser.DownloadProgress, on_download_progress)
        
        page = browser.main_tab
        
        # Configure download behavior browser-wide and enable progress events
        await browser.send(
            cdp_browser.set_download_behavior(
                behavior="allow",
                download_path=str(DOWNLOAD_DIR.resolve()),
                events_enabled=True
            )
        )
        
        index = 0
        while index < len(urls) and is_downloading:
            # Handle paused state
            while is_paused and is_downloading:
                await asyncio.sleep(0.5)
                
            if not is_downloading:
                break
                
            url = urls[index]
            url_clean = url.strip()
            if not url_clean:
                index += 1
                continue
                
            global active_url, last_percent, download_speed_info
            active_url = url_clean
            last_percent = -1
            download_speed_info[url_clean] = {
                'last_bytes': 0,
                'last_time': time.time(),
                'speed': 0.0
            }
            
            run_js("js_update_active_url", url_clean, "Analyzing link...")
            run_js("js_log", "Worker", f"Processing url {index + 1}/{len(urls)}: {url_clean}")
            
            paused_this_turn = False
            
            try:
                # YouTube Link detection in main queue
                if "youtube.com" in url_clean or "youtu.be" in url_clean:
                    run_js("js_log", "System", "YouTube link detected in queue. Redirecting to yt-dlp module...")
                    run_js("js_update_active_url", url_clean, "Downloading via yt-dlp...")
                    
                    # Fetch quality preference or default to Best
                    cfg = load_config()
                    quality_preference = cfg.get("yt_quality_default", "1")
                    
                    # Define progress wrapper to map to GUI downloader progress
                    last_js_update = [0.0]
                    last_video_id = [None]
                    
                    def ytdlp_queue_progress(d):
                        global is_paused
                        if is_paused:
                            raise RuntimeError("Paused by user")
                        if not is_downloading:
                            raise RuntimeError("Cancelled by user")
                            
                        # Extract active video title and playlist parameters
                        info_dict = d.get('info_dict', {})
                        video_id = info_dict.get('id')
                        video_title = info_dict.get('title', 'YouTube Video')
                        playlist_index = info_dict.get('playlist_index')
                        playlist_count = info_dict.get('playlist_count')
                        
                        # Update current video filename dynamically if it changes
                        if video_id and video_id != last_video_id[0]:
                            last_video_id[0] = video_id
                            status_msg = "Downloading..."
                            if playlist_index is not None:
                                total_str = f"/{playlist_count}" if playlist_count else ""
                                status_msg = f"Downloading ({playlist_index}{total_str})..."
                            run_js("js_update_active_url", url_clean, status_msg, video_title)
                            run_js("js_log", "Worker", f"Starting playlist video: {video_title}")
                            
                        if d['status'] == 'downloading':
                            downloaded = d.get('downloaded_bytes', 0)
                            total = d.get('total_bytes') or d.get('total_bytes_estimate', 0)
                            speed = d.get('speed', 0.0)
                            
                            percent = 0.0
                            if total > 0:
                                percent = (downloaded / total) * 100
                                
                            now = time.time()
                            is_final = percent >= 100.0 or downloaded == total
                            if is_final or (now - last_js_update[0] >= 0.75):
                                # Call JS progress update
                                run_js("js_update_download_progress", url_clean, "downloading", round(percent, 1), speed, downloaded, total)
                                last_js_update[0] = now
                                
                    # Match filter hook to abort early on playlist items
                    def ytdlp_match_filter(info_dict, *, incomplete):
                        global is_paused
                        if is_paused:
                            raise RuntimeError("Paused by user")
                        if not is_downloading:
                            raise RuntimeError("Cancelled by user")
                        return None
                    
                    # Configure options
                    ydl_opts = {
                        'outtmpl': os.path.join(str(DOWNLOAD_DIR), '%(playlist_title&{}|)s', '%(playlist_index&{:03d} - |)s%(title)s.%(ext)s'),
                        'progress_hooks': [ytdlp_queue_progress],
                        'match_filter': ytdlp_match_filter,
                        'quiet': True,
                        'no_warnings': True,
                        'ffmpeg_location': str(CONFIG_DIR),
                    }
                    
                    # Set format based on quality_preference
                    if quality_preference == '1':
                        ydl_opts['format'] = 'bestvideo+bestaudio/best'
                        ydl_opts['merge_output_format'] = 'mp4'
                    elif quality_preference == '2':
                        ydl_opts['format'] = 'bestvideo[height<=1080][fps<=60]+bestaudio/best[height<=1080]'
                        ydl_opts['merge_output_format'] = 'mp4'
                    elif quality_preference == '3':
                        ydl_opts['format'] = 'bestvideo[height<=1080][fps<=30]+bestaudio/best[height<=1080]'
                        ydl_opts['merge_output_format'] = 'mp4'
                    elif quality_preference == '4':
                        ydl_opts['format'] = 'bestvideo[height<=720][fps<=60]+bestaudio/best[height<=720]'
                        ydl_opts['merge_output_format'] = 'mp4'
                    elif quality_preference == '5':
                        ydl_opts['format'] = 'bestvideo[height<=720][fps<=30]+bestaudio/best[height<=720]'
                        ydl_opts['merge_output_format'] = 'mp4'
                    elif quality_preference == '6':
                        ydl_opts['format'] = 'bestaudio/best'
                        ydl_opts['postprocessors'] = [{
                            'key': 'FFmpegExtractAudio',
                            'preferredcodec': 'mp3',
                            'preferredquality': '192',
                        }]
                    else:
                        ydl_opts['format'] = 'bestvideo+bestaudio/best'
                        ydl_opts['merge_output_format'] = 'mp4'
                    
                    is_ytdlp_paused = False
                    try:
                        import yt_dlp
                        # Run extraction with flat extraction first for speed
                        ydl_opts_extract = ydl_opts.copy()
                        ydl_opts_extract['extract_flat'] = True
                        with yt_dlp.YoutubeDL(ydl_opts_extract) as ydl:
                            info = ydl.extract_info(url_clean, download=False)
                            resolved_title = info.get('title', 'YouTube Video')
                        
                        run_js("js_update_active_url", url_clean, "Downloading...", resolved_title)
                        
                        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                            ydl.download([url_clean])
                            
                        run_js("js_update_download_progress", url_clean, "completed", 100, 0, 100, 100)
                        add_history_record(url_clean, resolved_title, 'Completed')
                    except Exception as ytdlp_err:
                        err_msg = str(ytdlp_err)
                        if "Paused by user" in err_msg:
                            is_ytdlp_paused = True
                            run_js("js_update_active_url", url_clean, "Paused", resolved_title or "YouTube Video")
                        elif "Cancelled by user" in err_msg:
                            run_js("js_update_active_url", url_clean, "Cancelled")
                            add_history_record(url_clean, "YouTube Video (Cancelled)", 'Cancelled')
                        else:
                            run_js("js_log", "Error", f"yt-dlp queue download failed: {err_msg}")
                            run_js("js_update_active_url", url_clean, "Failed")
                            add_history_record(url_clean, "YouTube Video (Failed)", 'Cancelled')
                    
                    if is_ytdlp_paused:
                        paused_this_turn = True
                        continue
                    
                    continue
    
                # ── FuckingFast special handling (scrape direct link from HTML) ──────────────
                is_fuckingfast = 'fuckingfast' in url_clean.lower()
                if is_fuckingfast:
                    run_js("js_log", "Worker", "FuckingFast link detected – extracting direct download URL from page HTML...")
                    run_js("js_update_active_url", url_clean, "Analyzing link...")
                    extracted_url = None
                    try:
                        import re as _re
                        ff_req = urllib.request.Request(
                            url_clean,
                            headers={
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                                'Accept-Language': 'en-US,en;q=0.5',
                                'Referer': 'https://fuckingfast.co/',
                            }
                        )
                        with urllib.request.urlopen(ff_req, timeout=15) as ff_resp:
                            html_content = ff_resp.read().decode('utf-8', errors='replace')
                        
                        # Pattern 1: href link pointing to a downloadable file
                        patterns = [
                            r'href=["\']([^"\']*fuckingfast\.co/[^"\']*(?:\.zip|\.rar|\.7z|\.mp4|\.mkv|\.mp3|\.exe|\.iso|\.tar|\.gz)[^"\']*)["\']',
                            r'href=["\']([^"\']+)["\'][^>]*>[^<]*(?:DOWNLOAD|Download|download)',
                            r'"downloadUrl"\s*:\s*"([^"]+)"',
                            r"'downloadUrl'\s*:\s*'([^']+)'",
                            r'action=["\']([^"\']+)["\']',
                            r'data-url=["\']([^"\']+)["\']',
                            r'href=["\']([^"\']+\.[a-zA-Z0-9]{2,5})["\'][^>]*class=["\'][^"\']*(?:btn|download)[^"\']*["\']',
                        ]
                        for pat in patterns:
                            m = _re.search(pat, html_content, _re.IGNORECASE)
                            if m:
                                candidate = m.group(1).strip()
                                if candidate.startswith('http') and candidate != url_clean:
                                    extracted_url = candidate
                                    break
                        
                        if not extracted_url:
                            # Broad search: any https link with a file extension
                            all_links = _re.findall(r'https?://[^\s"\'<>]+', html_content)
                            file_exts = ('.zip', '.rar', '.7z', '.tar', '.gz', '.mp4', '.mkv', '.avi', '.mp3', '.wav', '.flac', '.exe', '.iso', '.pdf', '.epub')
                            for link in all_links:
                                link_lower = link.lower().split('?')[0]
                                if any(link_lower.endswith(ext) for ext in file_exts):
                                    extracted_url = link
                                    break
                    except Exception as ff_err:
                        run_js("js_log", "Error", f"FuckingFast page fetch failed: {ff_err}")
                    
                    if extracted_url:
                        run_js("js_log", "Worker", f"Extracted direct URL from FuckingFast: {extracted_url[:80]}...")
                        # Now download the extracted URL directly
                        def ff_direct_progress(received, total, state, filename):
                            class DummyEvent:
                                def __init__(self, rec, tot, st):
                                    self.received_bytes = rec
                                    self.total_bytes = tot
                                    self.state = st
                            if filename:
                                download_speed_info[url_clean]['filename'] = filename
                                run_js("js_update_active_url", url_clean, state.capitalize(), filename)
                            event = DummyEvent(received, total, state)
                            asyncio.run_coroutine_threadsafe(on_download_progress(event), asyncio.get_event_loop())
                        
                        retries = 3
                        success = False
                        for attempt in range(retries):
                            if not is_downloading:
                                break
                            if attempt > 0:
                                run_js("js_log", "Worker", f"Retrying FuckingFast download ({attempt + 1}/{retries})...")
                                await asyncio.sleep(2)
                            success = await download_direct_file(extracted_url, DOWNLOAD_DIR, ff_direct_progress, run_js)
                            if success:
                                break
                        
                        if success:
                            final_filename = download_speed_info[url_clean].get('filename', 'FuckingFast File')
                            add_history_record(url_clean, final_filename, 'Completed')
                        else:
                            run_js("js_log", "Error", f"FuckingFast direct download failed after {retries} attempts.")
                            run_js("js_update_active_url", url_clean, "Failed")
                            add_history_record(url_clean, "FuckingFast Download", 'Cancelled')
                        continue
                    else:
                        run_js("js_log", "Worker", "Could not extract a direct URL from FuckingFast page. Falling back to browser automation...")
                        # Fall through to browser automation below
                
                # Direct link fast download detection
                url_hash = hashlib.md5(url_clean.encode('utf-8')).hexdigest()
                has_temp_file = (DOWNLOAD_DIR / f".rocket_{url_hash}.tmp").exists()
                
                is_dir = has_temp_file or is_direct_link(url_clean)

                if is_dir:
                    def direct_progress(received, total, state, filename):
                        class DummyEvent:
                            def __init__(self, rec, tot, st):
                                self.received_bytes = rec
                                self.total_bytes = tot
                                self.state = st
                        
                        if filename:
                            download_speed_info[url_clean]['filename'] = filename
                            run_js("js_update_active_url", url_clean, state.capitalize(), filename)
                        
                        event = DummyEvent(received, total, state)
                        # Run on_download_progress asynchronously on the event loop
                        asyncio.run_coroutine_threadsafe(on_download_progress(event), asyncio.get_event_loop())
                    
                    retries = 3
                    success = False
                    for attempt in range(retries):
                        if not is_downloading:
                            break
                        if attempt > 0:
                            run_js("js_log", "Worker", f"Retrying direct download ({attempt + 1}/{retries})...")
                            await asyncio.sleep(3)
                        success = await download_direct_file(url_clean, DOWNLOAD_DIR, direct_progress, run_js)
                        if success:
                            break
                    
                    if success == "PAUSED":
                        paused_this_turn = True
                        continue
                    elif success:
                        final_filename = download_speed_info[url_clean].get('filename', 'Direct File')
                        add_history_record(url_clean, final_filename, 'Completed')
                        continue
                    else:
                        run_js("js_log", "Error", f"Direct download failed after {retries} attempts.")
                        run_js("js_update_active_url", url_clean, "Failed")
                        add_history_record(url_clean, "Direct Download Failed (Failed)", 'Cancelled')
                        continue
    
                if True:
                    # Load page
                    await page.get(url_clean)
                    
                    if not is_downloading:
                        run_js("js_log", "System", "Download process stopped by user.")
                        break
                        
                    run_js("js_update_active_url", url_clean, "Page loaded, waiting for popup...")
                    run_js("js_log", "Worker", "Navigated to page. Searching for 'DOWNLOAD' button...")
                    
                    # Locate the button by text
                    download_btn = await page.find("DOWNLOAD", best_match=True, timeout=15)
                    if not download_btn:
                        download_btn = await page.find("Download", best_match=True, timeout=5)
                        
                    if not download_btn:
                        run_js("js_log", "Error", "Could not find a 'DOWNLOAD' button on the page.")
                        run_js("js_update_active_url", url_clean, "Failed: Button not found")
                        continue
                    
                    # Save current tabs before clicking to close ad popup later
                    old_tabs = list(browser.tabs)
                    
                    # First click (usually triggers popup ad)
                    await download_btn.click()
                    
                    # Wait for the popup to open
                    await page.sleep(2)
                    
                    # Find and close any new popup tabs
                    new_tabs = [t for t in browser.tabs if t not in old_tabs]
                    for tab in new_tabs:
                        try:
                            run_js("js_log", "Worker", "Closing popup ad tab...")
                            await tab.close()
                        except Exception as tab_err:
                            run_js("js_log", "Worker", f"Note: Popup tab already closed/destroyed ({tab_err})")
                        
                    if not is_downloading:
                        run_js("js_log", "System", "Download process stopped by user.")
                        break
                        
                    run_js("js_log", "Worker", "Popup ad closed. Triggering actual download...")
                    run_js("js_update_active_url", url_clean, "Popup closed. Fetching file...")
                    
                    # Search for download button again for the second click
                    download_btn2 = await page.find("DOWNLOAD", best_match=True, timeout=10)
                    if not download_btn2:
                        download_btn2 = await page.find("Download", best_match=True, timeout=5)
                    if not download_btn2:
                        download_btn2 = download_btn
                        
                    # Track downloads directory to see when file completes
                    files_before = set(DOWNLOAD_DIR.iterdir())
                    
                    # Click the download button again to trigger actual file download
                    await download_btn2.click()
                    
                    # Monitor files in the downloads directory
                    filename = None
                    run_js("js_update_active_url", url_clean, "Downloading...")
                    
                    for attempt in range(360):  # max 360 seconds (6 minutes)
                        await page.sleep(1)
                        if not is_downloading:
                            break
                            
                        files_now = set(DOWNLOAD_DIR.iterdir())
                        new_files = files_now - files_before
                        
                        # Filter out temporary files
                        active_downloads = [f for f in new_files if f.suffix in ('.crdownload', '.tmp')]
                        completed_downloads = [f for f in new_files if f.suffix not in ('.crdownload', '.tmp')]
                        
                        if completed_downloads and not active_downloads:
                            filename = completed_downloads[0].name
                            break
                            
                    if filename:
                        run_js("js_log", "Worker", f"Successfully saved download: {filename}")
                        run_js("js_update_active_url", url_clean, "Completed", filename)
                        add_history_record(url_clean, filename, "Completed")
                    else:
                        if not is_downloading:
                            run_js("js_log", "System", "Download process stopped by user.")
                            add_history_record(url_clean, filename or "Stopped URL", "Cancelled")
                        else:
                            run_js("js_log", "Worker", "Download timed out or failed to save file.")
                            run_js("js_update_active_url", url_clean, "Failed: Timeout")
                            add_history_record(url_clean, filename or "Timeout URL", "Cancelled")
                            
            except Exception as e:
                error_msg = str(e)
                run_js("js_log", "Error", f"Failed to download {url_clean}: {error_msg}")
                run_js("js_update_active_url", url_clean, f"Error: {error_msg[:50]}...")
                add_history_record(url_clean, "Error URL", "Cancelled")
            finally:
                active_url = None
                if not paused_this_turn:
                    index += 1
                
        # Close browser
        try:
            await browser.stop()
        except:
            pass
        run_js("js_log", "System", "Browser finished.")
        
    except Exception as e:
        run_js("js_log", "Error", f"Browser engine error: {e}")
        
    is_downloading = False
    browser_instance = None
    run_js("js_on_downloads_completed")

def run_async_worker(urls, headless):
    asyncio.run(download_worker(urls, headless))

def format_bytes_helper(bytes_count):
    if not bytes_count or bytes_count <= 0:
        return '0 Bytes'
    k = 1024
    sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
    import math
    try:
        i = int(math.floor(math.log(bytes_count) / math.log(k)))
        return f"{float(bytes_count / math.pow(k, i)):.1f} {sizes[i]}"
    except Exception:
        return '0 Bytes'

def format_speed_helper(bytes_per_sec):
    if not bytes_per_sec or bytes_per_sec <= 0:
        return '0 KB/s'
    return f"{format_bytes_helper(bytes_per_sec)}/s"

def yt_dlp_worker(url, download_dir, quality_choice):
    global is_yt_downloading
    try:
        import yt_dlp
    except ImportError:
        run_js("js_log", "Error", "The 'yt-dlp' library is not installed in the python environment.")
        run_js("js_update_yt_progress", None, 0, "0 KB/s", "0 B", "0 B", "Unknown", "failed")
        return
        
    is_yt_downloading = True
    
    # If URL contains list=, force direct playlist URL conversion
    if 'list=' in url:
        import urllib.parse
        try:
            parsed_url = urllib.parse.urlparse(url)
            query_params = urllib.parse.parse_qs(parsed_url.query)
            playlist_id = query_params.get('list', [None])[0]
            if playlist_id:
                url = f"https://www.youtube.com/playlist?list={playlist_id}"
                run_js("js_log", "Worker", f"Constructed direct playlist link: {url}")
        except Exception as parse_err:
            run_js("js_log", "Error", f"Failed to parse playlist query parameter: {parse_err}")

    # 1. Check URL type quickly (playlist or video) using extract_flat
    run_js("js_log", "Worker", f"Checking URL type: {url}")
    run_js("js_update_yt_progress", "Checking link...", 0, "0 KB/s", "Connecting", "Connecting", "Unknown", "connecting")
    
    ydl_opts_flat = {
        'extract_flat': True,
        'skip_download': True,
        'quiet': True,
        'no_warnings': True,
    }
    
    is_playlist = False
    playlist_title = "Playlist"
    entries = []
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts_flat) as ydl:
            info = ydl.extract_info(url, download=False)
            if info and (info.get('_type') == 'playlist' or 'entries' in info):
                is_playlist = True
                playlist_title = info.get('title', 'Playlist')
                raw_entries = info.get('entries', [])
                if not isinstance(raw_entries, list):
                    try:
                        raw_entries = list(raw_entries)
                    except Exception:
                        pass
                entries = [e for e in raw_entries if e]
                run_js("js_log", "Worker", f"Detected playlist: '{playlist_title}' with {len(entries)} items.")
    except Exception as e:
        run_js("js_log", "Error", f"Metadata extraction failed: {e}")
        is_playlist = False

    # Define hook variables to share state
    last_idx = [-1]
    active_title = ["Connecting..."]

    def progress_hook(d):
        if not is_yt_downloading:
            raise RuntimeError("Cancelled by user")
            
        info_dict = d.get('info_dict', {})
        video_title = info_dict.get('title') or active_title[0]
        
        # Determine playlist indexing
        playlist_index = info_dict.get('playlist_index')
        playlist_count = info_dict.get('playlist_count')
        
        if playlist_index is not None:
            current_idx = playlist_index - 1
            if current_idx != last_idx[0]:
                if last_idx[0] >= 0:
                    run_js("js_update_yt_playlist_item", last_idx[0], "completed")
                run_js("js_update_yt_playlist_item", current_idx, "downloading")
                last_idx[0] = current_idx
            title_display = f"({playlist_index}/{playlist_count or len(entries)}) {video_title}"
        else:
            title_display = video_title

        if d['status'] == 'downloading':
            downloaded = d.get('downloaded_bytes', 0)
            total = d.get('total_bytes') or d.get('total_bytes_estimate', 0)
            speed = d.get('speed', 0.0)
            eta = d.get('eta')
            
            percent = 0.0
            if total > 0:
                percent = (downloaded / total) * 100
                
            speed_str = format_speed_helper(speed)
            received_str = format_bytes_helper(downloaded)
            total_str = format_bytes_helper(total)
            eta_str = f"{eta}s" if eta is not None else "Unknown"
            
            run_js(
                "js_update_yt_progress", 
                title_display, 
                round(percent, 1), 
                speed_str, 
                received_str, 
                total_str, 
                eta_str, 
                "downloading"
            )
        elif d['status'] == 'finished':
            # Add video to history
            video_url_val = info_dict.get('webpage_url') or info_dict.get('original_url') or url
            add_history_record(video_url_val, video_title, 'Completed')
            
            if playlist_index is not None:
                current_idx = playlist_index - 1
                run_js("js_update_yt_playlist_item", current_idx, "completed")
            
            run_js(
                "js_update_yt_progress", 
                title_display, 
                100, 
                "0 KB/s", 
                "Finished", 
                "Finished", 
                "0s", 
                "downloading"
            )

    # Setup option formatting
    def get_ydl_opts(download_dir, quality):
        ydl_opts = {
            'outtmpl': os.path.join(str(download_dir), '%(playlist_title&{}|)s', '%(playlist_index&{:03d} - |)s%(title)s.%(ext)s'),
            'progress_hooks': [progress_hook],
            'quiet': True,
            'no_warnings': True,
            'ignoreerrors': True, # ignore errors to prevent breaking playlists
            'ffmpeg_location': str(CONFIG_DIR),
        }
        
        # 1: Best Quality, 2: 1080p60, 3: 1080p30, 4: 720p60, 5: 720p30, 6: Audio MP3
        if quality == '1':
            ydl_opts['format'] = 'bestvideo+bestaudio/best'
            ydl_opts['merge_output_format'] = 'mp4'
        elif quality == '2':
            ydl_opts['format'] = 'bestvideo[height<=1080][fps<=60]+bestaudio/best[height<=1080]'
            ydl_opts['merge_output_format'] = 'mp4'
        elif quality == '3':
            ydl_opts['format'] = 'bestvideo[height<=1080][fps<=30]+bestaudio/best[height<=1080]'
            ydl_opts['merge_output_format'] = 'mp4'
        elif quality == '4':
            ydl_opts['format'] = 'bestvideo[height<=720][fps<=60]+bestaudio/best[height<=720]'
            ydl_opts['merge_output_format'] = 'mp4'
        elif quality == '5':
            ydl_opts['format'] = 'bestvideo[height<=720][fps<=30]+bestaudio/best[height<=720]'
            ydl_opts['merge_output_format'] = 'mp4'
        elif quality == '6':
            ydl_opts['format'] = 'bestaudio/best'
            ydl_opts['postprocessors'] = [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }]
        else:
            ydl_opts['format'] = 'bestvideo+bestaudio/best'
            ydl_opts['merge_output_format'] = 'mp4'
        return ydl_opts

    ydl_opts = get_ydl_opts(download_dir, quality_choice)

    if is_playlist and entries:
        titles = [e.get('title') or f"Video #{i+1}" for i, e in enumerate(entries)]
        run_js("js_init_yt_playlist", playlist_title, titles)
        
        run_js("js_log", "Worker", f"Starting direct playlist download process: {url}")
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])
            
            run_js("js_update_yt_progress", f"Playlist: {playlist_title}", 100, "0 KB/s", "Finished", "Finished", "0s", "completed")
            run_js("js_log", "System", "YouTube playlist download completed successfully!")
        except Exception as e:
            err_msg = str(e)
            if "Cancelled by user" in err_msg:
                run_js("js_log", "System", "YouTube download cancelled by user.")
                run_js("js_update_yt_progress", f"Playlist: {playlist_title}", 100, "0 KB/s", "Cancelled", "Cancelled", "Unknown", "canceled")
                if last_idx[0] >= 0:
                    run_js("js_update_yt_playlist_item", last_idx[0], "failed")
            else:
                run_js("js_log", "Error", f"yt-dlp playlist download failed: {err_msg}")
                run_js("js_update_yt_progress", f"Playlist: {playlist_title}", 100, "0 KB/s", "Failed", "Failed", "Unknown", "failed")
                if last_idx[0] >= 0:
                    run_js("js_update_yt_playlist_item", last_idx[0], "failed")
    else:
        run_js("js_log", "Worker", f"Starting single video download process: {url}")
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                title = info.get('title', 'Unknown Title')
                active_title[0] = title
                
                run_js("js_log", "Worker", f"Video Title Resolved: {title}")
                run_js("js_update_yt_progress", title, 0, "0 KB/s", "Connecting", "Connecting", "Unknown", "downloading")
                
                if not is_yt_downloading:
                    raise RuntimeError("Cancelled by user")
                    
                ydl.download([url])
                
                # Single history entry is already added in the finished state of progress_hook
                run_js("js_update_yt_progress", title, 100, "0 KB/s", "Finished", "Finished", "0s", "completed")
        except Exception as e:
            err_msg = str(e)
            if "Cancelled by user" in err_msg:
                run_js("js_log", "System", "YouTube download cancelled by user.")
                run_js("js_update_yt_progress", active_title[0], 0, "0 KB/s", "Cancelled", "Cancelled", "Unknown", "canceled")
            else:
                run_js("js_log", "Error", f"yt-dlp download failed: {err_msg}")
                run_js("js_update_yt_progress", active_title[0], 0, "0 KB/s", "Failed", "Failed", "Unknown", "failed")

    is_yt_downloading = False

# Exposed functions for Javascript calling inside PyWebView
class Api:
    def check_requirements(self):
        import zipfile
        import tarfile
        import shutil
        import threading
        import stat
        
        is_win = sys.platform == "win32"
        is_mac = sys.platform == "darwin"
        
        ffmpeg_name = "ffmpeg.exe" if is_win else "ffmpeg"
        ffprobe_name = "ffprobe.exe" if is_win else "ffprobe"
        
        ffmpeg_exe = CONFIG_DIR / ffmpeg_name
        ffprobe_exe = CONFIG_DIR / ffprobe_name
        
        if ffmpeg_exe.exists() and ffprobe_exe.exists():
            return {"status": "ok"}
            
        def downloader_thread():
            run_js("js_update_splash_status", "Downloading required video engines (0%)...")
            try:
                last_percent = -1
                def reporthook(count, block_size, total_size):
                    nonlocal last_percent
                    if total_size > 0:
                        percent = int((count * block_size * 100) / total_size)
                        if percent > 100: percent = 100
                        if percent > last_percent:
                            run_js("js_update_splash_status", f"Downloading required video engines ({percent}%)...")
                            last_percent = percent
                            
                if is_win:
                    zip_url = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip"
                    zip_path = CONFIG_DIR / "ffmpeg.zip"
                    urllib.request.urlretrieve(zip_url, zip_path, reporthook)
                    
                    run_js("js_update_splash_status", "Extracting engines... Please wait.")
                    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                        for file_info in zip_ref.infolist():
                            if file_info.filename.endswith('ffmpeg.exe'):
                                file_info.filename = 'ffmpeg.exe'
                                zip_ref.extract(file_info, path=CONFIG_DIR)
                            elif file_info.filename.endswith('ffprobe.exe'):
                                file_info.filename = 'ffprobe.exe'
                                zip_ref.extract(file_info, path=CONFIG_DIR)
                    zip_path.unlink(missing_ok=True)
                    
                elif is_mac:
                    zip_url = "https://evermeet.cx/ffmpeg/getrelease/zip"
                    zip_path = CONFIG_DIR / "ffmpeg.zip"
                    urllib.request.urlretrieve(zip_url, zip_path, reporthook)
                    
                    probe_url = "https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip"
                    probe_path = CONFIG_DIR / "ffprobe.zip"
                    urllib.request.urlretrieve(probe_url, probe_path, reporthook)
                    
                    run_js("js_update_splash_status", "Extracting engines... Please wait.")
                    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                        for file_info in zip_ref.infolist():
                            if file_info.filename.endswith('ffmpeg'):
                                file_info.filename = 'ffmpeg'
                                zip_ref.extract(file_info, path=CONFIG_DIR)
                    with zipfile.ZipFile(probe_path, 'r') as zip_ref:
                        for file_info in zip_ref.infolist():
                            if file_info.filename.endswith('ffprobe'):
                                file_info.filename = 'ffprobe'
                                zip_ref.extract(file_info, path=CONFIG_DIR)
                    zip_path.unlink(missing_ok=True)
                    probe_path.unlink(missing_ok=True)
                    
                    ffmpeg_exe.chmod(ffmpeg_exe.stat().st_mode | stat.S_IEXEC)
                    ffprobe_exe.chmod(ffprobe_exe.stat().st_mode | stat.S_IEXEC)
                    
                else:
                    # Linux
                    tar_url = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz"
                    tar_path = CONFIG_DIR / "ffmpeg.tar.xz"
                    urllib.request.urlretrieve(tar_url, tar_path, reporthook)
                    
                    run_js("js_update_splash_status", "Extracting engines... Please wait.")
                    with tarfile.open(tar_path, "r:xz") as tar:
                        for member in tar.getmembers():
                            if member.name.endswith('/ffmpeg'):
                                member.name = 'ffmpeg'
                                tar.extract(member, path=CONFIG_DIR)
                            elif member.name.endswith('/ffprobe'):
                                member.name = 'ffprobe'
                                tar.extract(member, path=CONFIG_DIR)
                    tar_path.unlink(missing_ok=True)
                    
                    ffmpeg_exe.chmod(ffmpeg_exe.stat().st_mode | stat.S_IEXEC)
                    ffprobe_exe.chmod(ffprobe_exe.stat().st_mode | stat.S_IEXEC)
                    
                run_js("js_on_requirements_done")
            except Exception as e:
                run_js("js_log", "Error", f"Failed to download ffmpeg: {e}")
                run_js("js_on_requirements_done")
                
        threading.Thread(target=downloader_thread, daemon=True).start()
        return {"status": "downloading"}

    def start_downloads(self, urls, headless):
        global download_thread, is_downloading
        if is_downloading:
            return "Already running"
            
        download_thread = threading.Thread(target=run_async_worker, args=(urls, headless), daemon=True)
        download_thread.start()
        return "Started"

    def stop_downloads(self):
        global is_downloading, browser_instance, is_paused
        is_paused = False
        if is_downloading:
            is_downloading = False
            run_js("js_log", "System", "Stopping download runner...")
            if browser_instance:
                try:
                    # browser_instance.stop() is a coroutine. Schedule it on the browser's loop threadsafe.
                    loop = browser_instance.loop
                    if loop and loop.is_running():
                        asyncio.run_coroutine_threadsafe(browser_instance.stop(), loop)
                except Exception as stop_err:
                    run_js("js_log", "Error", f"Failed to stop browser automation: {stop_err}")
            return "Stopping"
        return "Not running"

    def pause_downloads(self):
        global is_paused
        is_paused = True
        run_js("js_on_downloads_paused")
        run_js("js_log", "System", "Queue paused. Current file will finish, then the queue will wait.")
        return "Paused"

    def resume_downloads(self):
        global is_paused
        is_paused = False
        run_js("js_on_downloads_started")
        run_js("js_log", "System", "Resuming downloads...")
        return "Resumed"

    def open_downloads_folder(self):
        global DOWNLOAD_DIR
        try:
            if sys.platform == 'win32':
                os.startfile(DOWNLOAD_DIR)
            elif sys.platform == 'darwin':
                os.system(f'open "{DOWNLOAD_DIR}"')
            else:
                os.system(f'xdg-open "{DOWNLOAD_DIR}"')
            return True
        except Exception as e:
            return str(e)

    def open_external_url(self, url):
        try:
            import webbrowser
            webbrowser.open(url)
            return True
        except Exception as e:
            return str(e)

    def get_download_directory(self):
        global DOWNLOAD_DIR
        return str(DOWNLOAD_DIR)

    def get_disk_space(self):
        global DOWNLOAD_DIR
        try:
            import shutil
            usage = shutil.disk_usage(str(DOWNLOAD_DIR))
            return {
                "free": usage.free,
                "total": usage.total,
                "used": usage.used
            }
        except Exception as e:
            return {"error": str(e)}

    def log_js_error(self, message):
        print(f"[JS ERROR] {message}", flush=True)
        return True

    def get_config(self):
        return load_config()

    def save_config_value(self, key, value):
        cfg = load_config()
        cfg[key] = value
        save_config(cfg)
        return True

    def start_yt_download(self, url, quality_choice):
        global DOWNLOAD_DIR, is_yt_downloading
        is_yt_downloading = True
        thread = threading.Thread(
            target=yt_dlp_worker,
            args=(url, DOWNLOAD_DIR, quality_choice),
            daemon=True
        )
        thread.start()
        return "Started"

    def stop_yt_download(self):
        global is_yt_downloading
        is_yt_downloading = False
        return "Stopped"

    def select_download_directory(self):
        global DOWNLOAD_DIR, window_instance
        if window_instance:
            # Create a native folder picker dialog
            result = window_instance.create_file_dialog(webview.FOLDER_DIALOG)
            if result and len(result) > 0:
                folder_path = result[0]
                DOWNLOAD_DIR = Path(folder_path)
                save_download_dir(folder_path)
                return folder_path
        return None

    def clear_temp_files(self):
        global DOWNLOAD_DIR
        try:
            cleaned = []
            # Clean up chromium temp files, rocket temp files, and generic temp files
            patterns = ["*.crdownload", ".rocket_*.tmp", "*.tmp"]
            for pattern in patterns:
                for filepath in DOWNLOAD_DIR.glob(pattern):
                    if filepath.is_file():
                        filepath.unlink(missing_ok=True)
                        cleaned.append(filepath.name)
            if cleaned:
                run_js("js_log", "System", f"Cleaned up temporary download files: {', '.join(cleaned)}")
            return "Cleared"
        except Exception as e:
            run_js("js_log", "Error", f"Failed to clean up temporary files: {e}")
            return str(e)

    def get_history(self):
        global DOWNLOAD_DIR
        records = load_history()
        updated_records = []
        for r in records:
            status = r.get("status", "Cancelled")
            if status == "Completed":
                filename = r.get("filename")
                filepath = DOWNLOAD_DIR / filename
                if not filepath.exists():
                    status = "Deleted"
            
            updated_records.append({
                "url": r.get("url"),
                "filename": r.get("filename"),
                "status": status,
                "timestamp": r.get("timestamp")
            })
        return updated_records

    def clear_history(self):
        save_history([])
        run_js("js_log", "System", "Download history cleared.")
        return "Cleared"

def on_closing():
    global DOWNLOAD_DIR, is_downloading, browser_instance, is_paused
    
    # Check if there are any .crdownload files in the downloads directory
def on_closing(window_instance):
    global is_downloading, is_paused, browser_instance, DOWNLOAD_DIR
    
    is_downloading = False
    is_paused = False
    
    if browser_instance:
        try:
            browser_instance.stop()
        except:
            pass
            
    # Delete temporary files: crdownload, part, ytdl, .rocket_*.tmp, *.tmp, *.html
    patterns = ["*.crdownload", "*.part", "*.ytdl", ".rocket_*.tmp", "*.tmp", "*.html"]
    for pattern in patterns:
        try:
            for filepath in DOWNLOAD_DIR.glob(pattern):
                if filepath.is_file():
                    filepath.unlink(missing_ok=True)
        except:
            pass
            
    return True

if __name__ == '__main__':
    # Disable automatic DevTools popup in debug mode
    webview.settings['OPEN_DEVTOOLS_IN_DEBUG'] = False



    # Initialize and start native PyWebView window
    window_instance = webview.create_window(
        title="Rocket DL",
        url=index_url,
        js_api=Api(),
        width=1050,
        height=720,
        resizable=True
    )
    # Bind native window closing hook
    window_instance.events.closing += on_closing
    
    # Start webview loop
    webview.start(debug=True)
