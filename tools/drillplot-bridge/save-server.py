#!/usr/bin/env python3
"""LAN-reachable bridge between the drillplot web editor
(https://maikuru.github.io/drillplot/) and the local SVG files in
assets/diagrams/, for when drillplot's own Save/Get SVG only copies to
the clipboard instead of writing a file.

Run this on the machine that holds the repo, then pair it with
console-bridge.js pasted into the drillplot page's DevTools console on
whatever machine you're editing from (same LAN).

Binds to 0.0.0.0:8799 by default — reachable at this host's LAN IP.

Endpoints:
  GET  /list            -> JSON list of editable filenames
  GET  /file?name=X.svg -> raw SVG content of that file (for "Open from source")
  POST /file?name=X.svg -> overwrite that file with the request body (save)
  POST /                -> fallback: body saved as a new timestamped file in
                            /tmp/drillplot-incoming/ (used when no name is given)

Only filenames matching drill-<digits>.svg under DIAGRAMS_DIR are readable/writable,
to avoid path traversal now that this is exposed beyond localhost.
"""
import json
import os
import re
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

PORT = 8799
BIND = "0.0.0.0"
DIAGRAMS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "assets", "diagrams")
FALLBACK_DIR = "/tmp/drillplot-incoming"
NAME_RE = re.compile(r"^drill-\d+\.svg$")
os.makedirs(FALLBACK_DIR, exist_ok=True)


def extract_svg(body: str) -> str:
    try:
        data = json.loads(body)
        if isinstance(data, dict) and "svg" in data:
            return data["svg"]
    except (json.JSONDecodeError, TypeError):
        pass
    return body


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json(self, code, obj):
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(obj).encode())

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/list":
            names = sorted(
                f for f in os.listdir(DIAGRAMS_DIR) if NAME_RE.match(f)
            )
            self._json(200, {"files": names})
            return

        if parsed.path == "/file":
            name = parse_qs(parsed.query).get("name", [""])[0]
            if not NAME_RE.match(name):
                self._json(400, {"error": "bad name"})
                return
            path = os.path.join(DIAGRAMS_DIR, name)
            if not os.path.isfile(path):
                self._json(404, {"error": "not found"})
                return
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "image/svg+xml")
            self.end_headers()
            self.wfile.write(content.encode("utf-8"))
            return

        self._json(404, {"error": "unknown endpoint"})

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode("utf-8", errors="replace")
        svg_text = extract_svg(body)

        parsed = urlparse(self.path)
        name = parse_qs(parsed.query).get("name", [""])[0] if parsed.path == "/file" else ""

        if name:
            if not NAME_RE.match(name):
                self._json(400, {"error": "bad name"})
                return
            out_path = os.path.join(DIAGRAMS_DIR, name)
        else:
            ts = time.strftime("%Y%m%d-%H%M%S")
            out_path = os.path.join(FALLBACK_DIR, f"drill-{ts}.svg")

        with open(out_path, "w", encoding="utf-8") as f:
            f.write(svg_text)

        print(f"[drillplot-save] wrote {out_path} ({len(svg_text)} bytes)", flush=True)
        self._json(200, {"ok": True, "path": out_path})

    def log_message(self, fmt, *args):
        pass


if __name__ == "__main__":
    print(f"[drillplot-save] listening on http://{BIND}:{PORT}, serving {os.path.abspath(DIAGRAMS_DIR)}")
    HTTPServer((BIND, PORT), Handler).serve_forever()
