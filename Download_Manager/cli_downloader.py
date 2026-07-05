import sys
import os
import asyncio
import json
import time
from pathlib import Path
import urllib.request
import urllib.parse
import nodriver as uc
from nodriver.cdp import browser as cdp_browser

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
    if bytes_count == 0:
        return '0 Bytes'
    k = 1024
    dm = decimals if decimals >= 0 else 0
    sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
    import math
    if bytes_count < 0:
        return '0 Bytes'
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

def is_direct_link(url):
    try:
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
        has_direct_ext = any(path.endswith(ext) for ext in direct_extensions)
        
        # Check Content-Type via HEAD request to prevent downloading HTML pages
        try:
            req = urllib.request.Request(
                url,
                method='HEAD',
                headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
            )
            with urllib.request.urlopen(req, timeout=4) as resp:
                content_type = resp.headers.get('Content-Type', '').lower()
                if content_type:
                    if 'text/html' in content_type:
                        return False
                    return True
        except Exception:
            # If the HEAD request fails (e.g. 405 Method Not Allowed or 403 Forbidden), 
            # fall back to the quick extension check.
            if has_direct_ext:
                return True
    except Exception:
        pass
    return False

# Global variables for progress display
last_percent = -1
last_time = time.time()
last_bytes = 0

def draw_cli_progress(received, total, state, filename):
    global last_percent, last_time, last_bytes
    now = time.time()
    percent = 0
    if total > 0:
        percent = int((received / total) * 100)
        
    is_final = (state in ('completed', 'canceled')) or (percent >= 100)
    time_diff = now - last_time
    
    if is_final or time_diff >= 0.75:
        speed = 0.0
        if time_diff > 0:
            speed = (received - last_bytes) / time_diff
        
        # Display progress bar
        bar_length = 30
        filled_length = int(bar_length * percent // 100)
        bar = '=' * filled_length + '-' * (bar_length - filled_length)
        
        speed_str = format_speed(speed)
        size_str = f"{format_bytes(received)} / {format_bytes(total)}" if total > 0 else f"{format_bytes(received)}"
        
        # Output progress line
        sys.stdout.write(f"\rProgress: [{bar}] {percent}% | {size_str} | Speed: {speed_str}  ")
        sys.stdout.flush()
        
        last_percent = percent
        last_time = now
        last_bytes = received
        
        if is_final:
            sys.stdout.write("\n")
            sys.stdout.flush()

async def download_direct_file(url, download_dir):
    global last_percent, last_time, last_bytes
    # Reset tracking
    last_percent = -1
    last_time = time.time()
    last_bytes = 0
    
    print(f"\n[System] Direct link detected. Starting fast chunked downloader...")
    try:
        req = urllib.request.Request(
            url,
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
        )
        
        loop = asyncio.get_event_loop()
        
        def blocking_download():
            with urllib.request.urlopen(req, timeout=20) as response:
                # Prevent downloading HTML pages (e.g. redirected login or error pages)
                content_type = response.headers.get('Content-Type', '').lower()
                if 'text/html' in content_type:
                    raise ValueError("Target URL returned an HTML webpage instead of a binary file.")
                
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
                print(f"[Worker] Saving file as: {dest_path.name}")
                
                received_bytes = 0
                temp_dest = dest_path.with_suffix(dest_path.suffix + '.tmp')
                
                with open(temp_dest, 'wb') as out_file:
                    while True:
                        chunk = response.read(1024 * 64)
                        if not chunk:
                            break
                        out_file.write(chunk)
                        received_bytes += len(chunk)
                        
                        loop.call_soon_threadsafe(
                            draw_cli_progress,
                            received_bytes,
                            total_bytes,
                            'downloading',
                            dest_path.name
                        )
                
                if temp_dest.exists():
                    temp_dest.rename(dest_path)
                    
                loop.call_soon_threadsafe(
                    draw_cli_progress,
                    total_bytes,
                    total_bytes,
                    'completed',
                    dest_path.name
                )
                return dest_path.name

        filename = await loop.run_in_executor(None, blocking_download)
        print(f"[System] Direct download completed successfully: {filename}")
        return True
    except Exception as e:
        print(f"[Error] Direct download failed: {str(e)}")
        return False

# Progress callback for browser automation download events
async def on_browser_download_progress(event: cdp_browser.DownloadProgress):
    draw_cli_progress(event.received_bytes, event.total_bytes, event.state, None)

async def download_via_browser(url, download_dir, headless):
    global last_percent, last_time, last_bytes
    # Reset tracking
    last_percent = -1
    last_time = time.time()
    last_bytes = 0
    
    print(f"\n[System] Launching browser driver automation...")
    
    args = [
        "--disable-popup-blocking",
        "--window-size=1920,1080",
        "--disable-gpu",
        "--no-sandbox",
    ]
    if headless:
        args.append("--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
        args.append("--window-position=-10000,-10000")
        
    try:
        browser = await uc.start(headless=headless, browser_args=args)
        browser.add_handler(cdp_browser.DownloadProgress, on_browser_download_progress)
        
        page = browser.main_tab
        await browser.send(
            cdp_browser.set_download_behavior(
                behavior="allow",
                download_path=str(Path(download_dir).resolve()),
                events_enabled=True
            )
        )
        
        print(f"[Worker] Navigating to: {url}")
        await page.get(url)
        
        print(f"[Worker] Page loaded. Searching for 'DOWNLOAD' button...")
        download_btn = await page.find("DOWNLOAD", best_match=True, timeout=15)
        if not download_btn:
            download_btn = await page.find("Download", best_match=True, timeout=5)
            
        if not download_btn:
            print("[Error] Could not find a 'DOWNLOAD' button on the page.")
            await browser.stop()
            return False
            
        old_tabs = list(browser.tabs)
        await download_btn.click()
        await page.sleep(2)
        
        # Close ad popups
        new_tabs = [t for t in browser.tabs if t not in old_tabs]
        for tab in new_tabs:
            try:
                print("[Worker] Closing popup advertisement tab...")
                await tab.close()
            except Exception:
                pass
                
        # Find secondary click button (some sites require 2 clicks)
        download_btn2 = await page.find("DOWNLOAD", best_match=True, timeout=10)
        if not download_btn2:
            download_btn2 = await page.find("Download", best_match=True, timeout=5)
        if not download_btn2:
            download_btn2 = download_btn
            
        files_before = set(Path(download_dir).iterdir())
        
        print("[Worker] Triggering file transfer...")
        await download_btn2.click()
        
        # Monitor completion
        filename = None
        for attempt in range(360): # 6 minutes
            await page.sleep(1)
            files_now = set(Path(download_dir).iterdir())
            new_files = files_now - files_before
            
            active_downloads = [f for f in new_files if f.suffix in ('.crdownload', '.tmp')]
            completed_downloads = [f for f in new_files if f.suffix not in ('.crdownload', '.tmp')]
            
            if completed_downloads and not active_downloads:
                filename = completed_downloads[0].name
                break
                
        await browser.stop()
        if filename:
            print(f"[System] Browser automation download completed successfully: {filename}")
            return True
        else:
            print("[Error] Download timed out or failed to start.")
            return False
            
    except Exception as e:
        print(f"[Error] Browser automation failed: {str(e)}")
        try:
            await browser.stop()
        except Exception:
            pass
        return False

async def main():
    print("=" * 60)
    print("           OCTODOWNLOADER - CLI TERMINAL VERSION")
    print("=" * 60)
    
    # 1. Get save location path
    default_dir = get_default_download_dir()
    print(f"Default Save Location: {default_dir}")
    path_input = input("Press ENTER to use default, or enter custom path: ").strip()
    download_dir = Path(path_input) if path_input else default_dir
    download_dir.mkdir(parents=True, exist_ok=True)
    print(f"Using Directory: {download_dir.resolve()}")
    
    # 2. Get Headless configuration
    headless_input = input("Run browser in headless background mode? (y/n, default: y): ").strip().lower()
    headless = headless_input != 'n'
    
    # 3. Get links inputs
    print("\nEnter target download URLs. Paste links below, then press ENTER twice when done:")
    urls = []
    while True:
        line = sys.stdin.readline().strip()
        if not line:
            break
        urls.append(line)
        
    if not urls:
        print("[System] No links entered. Exiting...")
        return
        
    print(f"\n[System] Starting download queue of {len(urls)} files...")
    for idx, url in enumerate(urls):
        print("-" * 50)
        print(f"File {idx+1}/{len(urls)}: {url}")
        
        # Strategy selection: direct vs indirect
        if is_direct_link(url):
            success = await download_direct_file(url, download_dir)
            if success:
                continue
            print("[System] Fast direct download failed. Retrying with browser automation...")
            
        success = await download_via_browser(url, download_dir, headless)
        if not success:
            print(f"[Error] Failed to download: {url}")

    print("\n" + "=" * 60)
    print("All tasks completed. Thank you for using OctoDownloader!")
    print("=" * 60)

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[System] Process aborted by user. Exiting...")
