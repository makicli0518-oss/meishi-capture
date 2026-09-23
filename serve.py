"""開発用ローカルサーバー: http://localhost:5173/ でアプリを配信する（Node 不要）。"""
import functools
import http.server
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PORT = 5173


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript; charset=utf-8",
        ".webmanifest": "application/manifest+json",
        ".html": "text/html; charset=utf-8",
        ".css": "text/css; charset=utf-8",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        print(self.address_string(), fmt % args)


if __name__ == "__main__":
    handler = functools.partial(Handler, directory=str(ROOT))
    with http.server.ThreadingHTTPServer(("127.0.0.1", PORT), handler) as httpd:
        print(f"serving {ROOT} at http://localhost:{PORT}/")
        httpd.serve_forever()
