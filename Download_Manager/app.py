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
import nodriver as uc
from nodriver.cdp import browser as cdp_browser

# Resolve the web directory path (crucial for PyInstaller packaging)
if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
    web_dir = os.path.join(sys._MEIPASS, 'web')
else:
    web_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'web')

index_url = Path(os.path.join(web_dir, 'index.html')).resolve().as_uri()

# Persistent Configuration Setup
CONFIG_DIR = Path(os.environ.get("APPDATA", str(Path.home()))) / "OctoDownloader"
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
        # 1. Quick extension check
        parsed = urllib.parse.urlparse(url)
        path = parsed.path.lower()
        direct_extensions = (
            '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz',
            '.exe', '.msi', '.apk', '.dmg',
            '.mp3', '.mp4', '.mkv', '.avi', '.mov', '.wav',
            '.pdf', '.epub', '.docx', '.xlsx', '.pptx',
            '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico',
            '.iso', '.bin'
        )
        if any(path.endswith(ext) for ext in direct_extensions):
            return True
            
        # 2. Quick HEAD request
        req = urllib.request.Request(
            url,
            method='HEAD',
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
        )
        with urllib.request.urlopen(req, timeout=4) as resp:
            content_type = resp.headers.get('Content-Type', '').lower()
            if content_type and 'text/html' not in content_type:
                return True
    except Exception:
        pass
    return False

async def download_direct_file(url, download_dir, progress_callback, log_callback):
    global is_downloading
    try:
        log_callback("System", "Direct link detected. Initializing fast HTTP download...")
        
        req = urllib.request.Request(
            url,
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
        )
        
        loop = asyncio.get_event_loop()
        
        def blocking_download():
            global is_downloading
            with urllib.request.urlopen(req, timeout=20) as response:
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
                base_name = dest_path.stem
                suffix = dest_path.suffix
                counter = 1
                while dest_path.exists():
                    dest_path = Path(download_dir) / f"{base_name}_{counter}{suffix}"
                    counter += 1
                    
                total_bytes = int(response.headers.get('Content-Length', 0))
                log_callback("Worker", f"Saving file as: {dest_path.name}")
                
                received_bytes = 0
                temp_dest = dest_path.with_suffix(dest_path.suffix + '.tmp')
                
                with open(temp_dest, 'wb') as out_file:
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
                            dest_path.name
                        )
                
                if not is_downloading:
                    if temp_dest.exists():
                        temp_dest.unlink(missing_ok=True)
                    raise InterruptedError("Cancelled by user")
                    
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

        filename = await loop.run_in_executor(None, blocking_download)
        log_callback("System", f"Direct download finished: {filename}")
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
    global is_downloading, browser_instance, DOWNLOAD_DIR
    is_downloading = True
    
    # Notify JS that downloads started
    run_js("js_on_downloads_started")
    
    try:
        run_js("js_log", "System", "Launching browser...")
        
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
        
        for index, url in enumerate(urls):
            if not is_downloading:
                run_js("js_log", "System", "Download process stopped by user.")
                break
                
            # Handle paused state
            global is_paused
            while is_paused and is_downloading:
                await asyncio.sleep(0.5)
                
            if not is_downloading:
                break
                
            url_clean = url.strip()
            if not url_clean:
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
            
            # Direct link fast download detection
            if is_direct_link(url_clean):
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
                
                success = await download_direct_file(url_clean, DOWNLOAD_DIR, direct_progress, run_js)
                if success:
                    final_filename = download_speed_info[url_clean].get('filename', 'Direct File')
                    add_history_record(url_clean, final_filename, 'Completed')
                    continue
                else:
                    run_js("js_log", "Worker", "Direct download failed. Falling back to browser automation mode...")

            try:
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
                
        # Close browser
        try:
            browser.stop()
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
    try:
        import yt_dlp
    except ImportError:
        run_js("js_log", "Error", "The 'yt-dlp' library is not installed in the python environment.")
        run_js("js_update_yt_progress", None, 0, "0 KB/s", "0 B", "0 B", "Unknown", "failed")
        return
        
    title_box = ["Connecting..."]
    
    def progress_hook(d):
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
                title_box[0], 
                round(percent, 1), 
                speed_str, 
                received_str, 
                total_str, 
                eta_str, 
                "downloading"
            )
            
        elif d['status'] == 'finished':
            run_js(
                "js_update_yt_progress", 
                title_box[0], 
                100, 
                "0 KB/s", 
                "Finished", 
                "Finished", 
                "0s", 
                "downloading"
            )

    # Setup options
    ydl_opts = {
        'outtmpl': os.path.join(str(download_dir), '%(title)s.%(ext)s'),
        'progress_hooks': [progress_hook],
        'quiet': True,
        'no_warnings': True,
    }
    
    # 1: Best Quality, 2: 1080p60, 3: 1080p30, 4: 720p60, 5: 720p30, 6: Audio MP3
    if quality_choice == '1':
        ydl_opts['format'] = 'bestvideo+bestaudio/best'
        ydl_opts['merge_output_format'] = 'mp4'
    elif quality_choice == '2':
        ydl_opts['format'] = 'bestvideo[height<=1080][fps<=60]+bestaudio/best[height<=1080]'
        ydl_opts['merge_output_format'] = 'mp4'
    elif quality_choice == '3':
        ydl_opts['format'] = 'bestvideo[height<=1080][fps<=30]+bestaudio/best[height<=1080]'
        ydl_opts['merge_output_format'] = 'mp4'
    elif quality_choice == '4':
        ydl_opts['format'] = 'bestvideo[height<=720][fps<=60]+bestaudio/best[height<=720]'
        ydl_opts['merge_output_format'] = 'mp4'
    elif quality_choice == '5':
        ydl_opts['format'] = 'bestvideo[height<=720][fps<=30]+bestaudio/best[height<=720]'
        ydl_opts['merge_output_format'] = 'mp4'
    elif quality_choice == '6':
        ydl_opts['format'] = 'bestaudio/best'
        ydl_opts['postprocessors'] = [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }]
    else:
        ydl_opts['format'] = 'bestvideo+bestaudio/best'
        ydl_opts['merge_output_format'] = 'mp4'

    run_js("js_log", "Worker", f"Connecting to YouTube URL: {url}")
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            title = info.get('title', 'Unknown Title')
            title_box[0] = title
            
            run_js("js_log", "Worker", f"Video Title Resolved: {title}")
            run_js("js_update_yt_progress", title, 0, "0 KB/s", "Connecting", "Connecting", "Unknown", "downloading")
            
            ydl.download([url])
            
            add_history_record(url, title, 'Completed')
            run_js("js_update_yt_progress", title, 100, "0 KB/s", "Finished", "Finished", "0s", "completed")
            
    except Exception as e:
        run_js("js_log", "Error", f"yt-dlp download failed: {str(e)}")
        run_js("js_update_yt_progress", title_box[0], 0, "0 KB/s", "Failed", "Failed", "Unknown", "failed")

# Exposed functions for Javascript calling inside PyWebView
class Api:
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
                    browser_instance.stop()
                except Exception:
                    pass
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

    def get_config(self):
        return load_config()

    def save_config_value(self, key, value):
        cfg = load_config()
        cfg[key] = value
        save_config(cfg)
        return True

    def start_yt_download(self, url, quality_choice):
        global DOWNLOAD_DIR
        thread = threading.Thread(
            target=yt_dlp_worker,
            args=(url, DOWNLOAD_DIR, quality_choice),
            daemon=True
        )
        thread.start()
        return "Started"

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
            for filepath in DOWNLOAD_DIR.glob("*.crdownload"):
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
    has_crfiles = False
    try:
        has_crfiles = any(DOWNLOAD_DIR.glob("*.crdownload"))
    except:
        pass
        
    if has_crfiles:
        # Show native Windows confirmation box with YES/NO options
        import ctypes
        # MB_YESNO = 0x00000004, MB_ICONQUESTION = 0x00000020, MB_TOPMOST = 0x00040000
        res = ctypes.windll.user32.MessageBoxW(
            None,
            "You have unfinished downloads.\n\nClick 'Yes' to delete temporary files and exit.\nClick 'No' to keep temporary files and exit.",
            "Unfinished Downloads",
            0x00000004 | 0x00000020 | 0x00040000
        )
        
        # Stop browser first to release locks
        is_downloading = False
        is_paused = False
        if browser_instance:
            try:
                browser_instance.stop()
            except:
                pass
                
        if res == 6: # IDYES (delete files and exit)
            # Delete files
            try:
                for filepath in DOWNLOAD_DIR.glob("*.crdownload"):
                    if filepath.is_file():
                        filepath.unlink(missing_ok=True)
            except:
                pass
            return True # Allow close (deletes files)
        elif res == 7: # IDNO (keep files and exit)
            return True # Allow close (keeps files)
            
    # If no .crdownload files, allow closing immediately
    is_downloading = False
    is_paused = False
    if browser_instance:
        try:
            browser_instance.stop()
        except:
            pass

    return True

if __name__ == '__main__':
    # Disable automatic DevTools popup in debug mode
    webview.settings['OPEN_DEVTOOLS_IN_DEBUG'] = False

    # Initialize and start native PyWebView window
    window_instance = webview.create_window(
        title="OctoDownloader",
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
