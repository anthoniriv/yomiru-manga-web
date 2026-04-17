"""
Cloudflare solver — HTTP service that uses undetected-chromedriver
to bypass Cloudflare challenges and return page HTML.
Runs on port 8191.
"""

import json
import os
import subprocess
import sys
import time
from http.server import HTTPServer, BaseHTTPRequestHandler

import undetected_chromedriver as uc
from undetected_chromedriver import Patcher

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CHROMEDRIVER_PATH = os.path.join(SCRIPT_DIR, "bin", "chromedriver")
CHROME_BINARY = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PORT = 8191
TIMEOUT = 30

driver = None


def patch_and_sign_chromedriver():
    """Patch chromedriver to remove detection, then re-sign for macOS ARM64."""
    patcher = Patcher(executable_path=CHROMEDRIVER_PATH)
    if patcher.is_binary_patched():
        print("[CF-Solver] Chromedriver already patched")
    else:
        print("[CF-Solver] Patching chromedriver...")
        patcher.patch()
        print("[CF-Solver] Patched!")

    # Re-sign the binary (required on macOS ARM64 after binary modification)
    print("[CF-Solver] Signing chromedriver for macOS ARM64...")
    subprocess.run(
        ["codesign", "--force", "--deep", "-s", "-", CHROMEDRIVER_PATH],
        check=True,
    )
    print("[CF-Solver] Signed!")


def get_driver():
    global driver
    if driver is None:
        options = uc.ChromeOptions()
        options.add_argument("--headless=new")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-gpu")
        options.add_argument("--window-size=1920,1080")
        options.add_argument("--lang=es-ES")
        options.binary_location = CHROME_BINARY

        # Use already-patched chromedriver (skip UC's own patching)
        from selenium.webdriver.chrome.service import Service
        service = Service(executable_path=CHROMEDRIVER_PATH)

        driver = uc.Chrome(
            options=options,
            service=service,
            driver_executable_path=CHROMEDRIVER_PATH,
            patcher_force_close=True,
        )
    return driver


def solve(url):
    """Navigate to URL, wait for CF to pass, return HTML."""
    d = get_driver()
    d.get(url)

    start = time.time()
    while time.time() - start < TIMEOUT:
        title = d.title or ""
        source = d.page_source or ""
        if "Just a moment" in title or "Un momento" in title:
            time.sleep(2)
            continue
        if "challenge-platform" in source and len(source) < 50000:
            time.sleep(2)
            continue
        return {"success": True, "html": source, "url": d.current_url}

    return {"success": False, "error": "Cloudflare challenge timeout", "html": ""}


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length)) if length > 0 else {}

        url = body.get("url", "")
        if not url:
            self.send_json(400, {"error": "Missing 'url' in request body"})
            return

        print(f"[CF-Solver] Solving: {url}")
        try:
            result = solve(url)
            status = 200 if result["success"] else 408
            print(f"[CF-Solver] {'OK' if result['success'] else 'TIMEOUT'} — {len(result.get('html', ''))} chars")
            self.send_json(status, result)
        except Exception as e:
            print(f"[CF-Solver] Error: {e}")
            self.send_json(500, {"error": str(e), "success": False})

    def send_json(self, status, data):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def log_message(self, format, *args):
        pass


if __name__ == "__main__":
    print(f"[CF-Solver] Starting on port {PORT}...")

    try:
        patch_and_sign_chromedriver()
        print("[CF-Solver] Launching Chrome...")
        get_driver()
        print("[CF-Solver] Chrome ready!")
    except Exception as e:
        print(f"[CF-Solver] Failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

    server = HTTPServer(("0.0.0.0", PORT), Handler)
    print(f"[CF-Solver] Ready at http://localhost:{PORT}")
    server.serve_forever()
