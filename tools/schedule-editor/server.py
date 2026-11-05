import json
import mimetypes
import socket
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

from lib import yaml_store_sessions as sessions_store
from lib import yaml_store_drills as drills_store
from lib import diagram_files
from lib import git_ops

PORT = 8800
STATIC_DIR = Path(__file__).resolve().parent / "static"


class AppState:
    def __init__(self, root: Path):
        self.root = root
        self.sessions_path = root / "content" / "sessions.yaml"
        self.drills_path = root / "content" / "drills.yaml"
        self.diagrams_dir = root / "assets" / "diagrams"
        self.lock = threading.Lock()
        self.build_ok = False
        self.last_change = None  # e.g. {"kind": "session", "date": "..."}


class ScheduleEditorServer(HTTPServer):
    def __init__(self, addr, handler_cls, state: AppState):
        super().__init__(addr, handler_cls)
        self.state = state


def detect_lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    finally:
        s.close()


def suggested_message(last_change):
    if not last_change:
        return "更新課表內容"
    if last_change["kind"] == "session":
        return f"新增／調整 {last_change['date']} 課表"
    if last_change["kind"] == "session_delete":
        return f"刪除 {last_change['date']} 課表"
    if last_change["kind"] == "drill":
        return f"新增 drill：{last_change['title_zh']}"
    return "更新課表內容"


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def _serve_static(self, path):
        rel = "index.html" if path == "/" else path.lstrip("/")
        file_path = (STATIC_DIR / rel).resolve()
        if STATIC_DIR not in file_path.parents or not file_path.is_file():
            return self._json(404, {"error": "not found"})
        content_type, _ = mimetypes.guess_type(str(file_path))
        self.send_response(200)
        self.send_header("Content-Type", content_type or "application/octet-stream")
        self.end_headers()
        self.wfile.write(file_path.read_bytes())

    def do_GET(self):
        state = self.server.state
        parsed = urlparse(self.path)
        path, query = parsed.path, parse_qs(parsed.query)

        if path == "/api/sessions":
            return self._json(200, {"sessions": sessions_store.list_sessions(state.sessions_path)})

        if path.startswith("/api/sessions/"):
            date = path[len("/api/sessions/"):]
            session = sessions_store.get_session(state.sessions_path, date)
            return self._json(200, session) if session else self._json(404, {"error": "not found"})

        if path == "/api/drills":
            doc = drills_store.load_drills_doc(state.drills_path)
            flat = [{"id": d["id"], "title_zh": d["title_zh"], "category_code": c["code"]}
                    for c in doc["categories"] for d in c["drills"]]
            return self._json(200, {"drills": flat})

        if path == "/api/categories":
            return self._json(200, {"categories": drills_store.list_categories(state.drills_path)})

        if path == "/api/drills/next-id":
            return self._json(200, {"next_id": drills_store.next_drill_id(state.drills_path)})

        if path == "/api/diagram/list":
            return self._json(200, {"files": diagram_files.list_diagram_files(state.diagrams_dir)})

        if path == "/api/diagram/file":
            name = query.get("name", [""])[0]
            try:
                svg = diagram_files.read_diagram_file(state.diagrams_dir, name)
            except (ValueError, FileNotFoundError):
                return self._json(404, {"error": "not found"})
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "image/svg+xml")
            self.end_headers()
            self.wfile.write(svg.encode("utf-8"))
            return

        if path == "/api/diagram/exists":
            drill_id = int(query.get("drill_id", ["0"])[0])
            return self._json(200, {"exists": diagram_files.diagram_exists(state.diagrams_dir, drill_id)})

        if path == "/api/console-bridge-script":
            template = (STATIC_DIR / "console-bridge.template.js").read_text(encoding="utf-8")
            target_id = drills_store.next_drill_id(state.drills_path)
            script = template.replace("__BASE__", f"http://{detect_lan_ip()}:{PORT}")
            script = script.replace("__TARGET__", f"drill-{target_id:02d}.svg")
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "application/javascript")
            self.end_headers()
            self.wfile.write(script.encode("utf-8"))
            return

        if path == "/api/diff":
            return self._json(200, git_ops.git_diff(state.root))

        if path == "/api/commit/suggested-message":
            return self._json(200, {"message": suggested_message(state.last_change)})

        self._serve_static(path)

    def do_POST(self):
        state = self.server.state
        parsed = urlparse(self.path)
        path, query = parsed.path, parse_qs(parsed.query)

        if path == "/api/sessions":
            body = self._read_json()
            state.build_ok = False
            try:
                sessions_store.upsert_session(
                    state.sessions_path, body["session"],
                    original_date=body.get("original_date"), force=body.get("force", False),
                )
            except sessions_store.SessionConflict as e:
                return self._json(409, {"error": "conflict", "existing": e.existing})
            state.last_change = {"kind": "session", "date": body["session"]["date"]}
            return self._json(200, {"ok": True})

        if path == "/api/categories":
            body = self._read_json()
            try:
                drills_store.add_category(state.drills_path, body["code"], body["title_zh"], body["title_en"], body["focus"])
            except ValueError as e:
                return self._json(400, {"error": str(e)})
            return self._json(200, {"ok": True})

        if path == "/api/drills":
            body = self._read_json()
            state.build_ok = False
            drill_id = drills_store.next_drill_id(state.drills_path)
            if not diagram_files.diagram_exists(state.diagrams_dir, drill_id):
                return self._json(400, {"error": f"diagram not found for drill-{drill_id:02d}.svg — draw it in drillplot first"})
            drill = {
                "id": drill_id, "title_zh": body["title_zh"], "title_en": body["title_en"],
                "method": body["method"], "points": body["points"],
                "diagram_file": f"diagrams/drill-{drill_id:02d}.svg",
            }
            try:
                drills_store.add_drill(state.drills_path, body["category_code"], drill)
            except ValueError as e:
                return self._json(400, {"error": str(e)})
            state.last_change = {"kind": "drill", "title_zh": drill["title_zh"]}
            return self._json(200, {"ok": True, "id": drill_id})

        if path == "/api/diagram/file":
            name = query.get("name", [""])[0]
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length).decode("utf-8", errors="replace")
            try:
                data = json.loads(raw)
                svg_text = data["svg"] if isinstance(data, dict) and "svg" in data else raw
            except json.JSONDecodeError:
                svg_text = raw
            try:
                diagram_files.write_diagram_file(state.diagrams_dir, name, svg_text)
            except ValueError as e:
                return self._json(400, {"error": str(e)})
            return self._json(200, {"ok": True})

        if path == "/api/build":
            ok, output = git_ops.run_build(state.root)
            state.build_ok = ok
            return self._json(200, {"ok": ok, "output": output})

        if path == "/api/commit":
            body = self._read_json()
            if not state.build_ok:
                return self._json(409, {"error": "尚未通過 Test build"})
            try:
                commit_hash = git_ops.git_commit(state.root, body["message"])
            except git_ops.NothingToCommit:
                return self._json(400, {"error": "沒有可以 commit 的變更"})
            return self._json(200, {"ok": True, "commit": commit_hash})

        if path == "/api/push":
            try:
                output = git_ops.git_push(state.root)
            except RuntimeError as e:
                return self._json(500, {"error": str(e)})
            return self._json(200, {"ok": True, "output": output})

        self._json(404, {"error": "unknown endpoint"})

    def do_DELETE(self):
        state = self.server.state
        path = urlparse(self.path).path
        if path.startswith("/api/sessions/"):
            date = path[len("/api/sessions/"):]
            if sessions_store.get_session(state.sessions_path, date) is None:
                return self._json(404, {"error": "not found"})
            state.build_ok = False
            sessions_store.delete_session(state.sessions_path, date)
            state.last_change = {"kind": "session_delete", "date": date}
            return self._json(200, {"ok": True})
        self._json(404, {"error": "unknown endpoint"})

    def log_message(self, fmt, *args):
        pass


if __name__ == "__main__":
    root = Path(__file__).resolve().parent.parent.parent
    state = AppState(root)
    httpd = ScheduleEditorServer(("0.0.0.0", PORT), Handler, state)
    print(f"[schedule-editor] listening on http://0.0.0.0:{PORT}, repo root {root}")
    httpd.serve_forever()
