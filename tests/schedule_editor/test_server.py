import json
import subprocess
import threading
import urllib.request
import urllib.error
import pytest
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools" / "schedule-editor"))
from server import AppState, ScheduleEditorServer, Handler
from lib import diagram_files


def run(cmd, cwd):
    subprocess.run(cmd, cwd=cwd, check=True, capture_output=True)


@pytest.fixture
def running_server(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    run(["git", "init"], repo)
    run(["git", "config", "user.email", "t@example.com"], repo)
    run(["git", "config", "user.name", "Test"], repo)
    (repo / "content").mkdir()
    (repo / "content" / "sessions.yaml").write_text(
        "export_defaults: {}\nsessions:\n- date: '2026-11-06'\n  label: '11/6'\n  blocks: []\n",
        encoding="utf-8",
    )
    (repo / "content" / "drills.yaml").write_text(
        "site: {title: x}\ncategories:\n- code: '01'\n  title_zh: A\n  title_en: A\n  focus: f\n  drills:\n  - id: 1\n    title_zh: 既有\n    title_en: Existing\n    method: []\n    points: []\n    diagram_file: diagrams/drill-01.svg\n",
        encoding="utf-8",
    )
    (repo / "assets" / "diagrams").mkdir(parents=True)
    (repo / "assets" / "diagrams" / "drill-01.svg").write_text("<svg/>")
    (repo / "build.py").write_text("import sys; sys.exit(0)\n")
    run(["git", "add", "-A"], repo)
    run(["git", "commit", "-m", "init"], repo)

    state = AppState(repo)
    httpd = ScheduleEditorServer(("127.0.0.1", 0), Handler, state)
    port = httpd.server_address[1]
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{port}", repo
    httpd.shutdown()


def call(method, url, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method,
                                  headers={"Content-Type": "application/json"} if data else {})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


def test_get_sessions_lists_existing(running_server):
    base, _ = running_server
    status, body = call("GET", f"{base}/api/sessions")
    assert status == 200
    assert body["sessions"] == [{"date": "2026-11-06", "label": "11/6"}]


def test_create_session_then_fetch_it(running_server):
    base, _ = running_server
    status, body = call("POST", f"{base}/api/sessions", {
        "session": {"date": "2026-12-01", "label": "12/1", "blocks": []},
        "original_date": None, "force": False,
    })
    assert status == 200 and body["ok"] is True
    status, body = call("GET", f"{base}/api/sessions/2026-12-01")
    assert status == 200 and body["label"] == "12/1"


def test_create_session_colliding_date_returns_409(running_server):
    base, _ = running_server
    status, body = call("POST", f"{base}/api/sessions", {
        "session": {"date": "2026-11-06", "label": "撞期", "blocks": []},
        "original_date": None, "force": False,
    })
    assert status == 409
    assert body["existing"]["label"] == "11/6"


def test_delete_session(running_server):
    base, _ = running_server
    status, _ = call("DELETE", f"{base}/api/sessions/2026-11-06")
    assert status == 200
    status, _ = call("GET", f"{base}/api/sessions/2026-11-06")
    assert status == 404


def test_next_id_reflects_existing_drills(running_server):
    base, _ = running_server
    status, body = call("GET", f"{base}/api/drills/next-id")
    assert status == 200 and body["next_id"] == 2


def test_add_drill_without_diagram_is_rejected(running_server):
    base, _ = running_server
    status, body = call("POST", f"{base}/api/drills", {
        "category_code": "01", "title_zh": "沒畫圖", "title_en": "No Diagram",
        "method": ["x"], "points": ["x"],
    })
    assert status == 400
    assert "diagram" in body["error"]


def test_add_drill_after_diagram_drawn_succeeds(running_server):
    base, repo = running_server
    (repo / "assets" / "diagrams" / "drill-02.svg").write_text("<svg/>")
    status, body = call("POST", f"{base}/api/drills", {
        "category_code": "01", "title_zh": "新招式", "title_en": "New Move",
        "method": ["x"], "points": ["x"],
    })
    assert status == 200 and body["id"] == 2
    status, drills_body = call("GET", f"{base}/api/drills")
    # pin the :02d-padded diagram_file (Task 3 ruling) at the point it's stored,
    # not just at diagram_exists() — a regression here must fail a test.
    assert diagram_files.diagram_exists(repo / "assets" / "diagrams", 2)
    import yaml as _yaml
    doc = _yaml.safe_load((repo / "content" / "drills.yaml").read_text(encoding="utf-8"))
    new_drill = next(d for c in doc["categories"] for d in c["drills"] if d["id"] == 2)
    assert new_drill["diagram_file"] == "diagrams/drill-02.svg"


def test_add_drill_ignores_client_supplied_id(running_server):
    base, repo = running_server
    (repo / "assets" / "diagrams" / "drill-02.svg").write_text("<svg/>")
    status, body = call("POST", f"{base}/api/drills", {
        "category_code": "01", "title_zh": "忽略這個 id", "title_en": "Ignore Id",
        "method": ["x"], "points": ["x"], "id": 999,
    })
    assert status == 200 and body["id"] == 2  # server recomputed it, not 999


def test_list_drills_flattened(running_server):
    base, _ = running_server
    status, body = call("GET", f"{base}/api/drills")
    assert status == 200
    assert body["drills"] == [{"id": 1, "title_zh": "既有", "category_code": "01"}]


def test_commit_blocked_after_edit_following_a_passing_build(running_server):
    base, repo = running_server
    (repo / "content" / "sessions.yaml").write_text("export_defaults: {}\nsessions: []\n", encoding="utf-8")
    call("POST", f"{base}/api/build")
    call("POST", f"{base}/api/sessions", {
        "session": {"date": "2026-12-25", "label": "12/25", "blocks": []},
        "original_date": None, "force": False,
    })
    status, _ = call("POST", f"{base}/api/commit", {"message": "不應該成功"})
    assert status == 409


def test_add_category_then_use_it(running_server):
    base, _ = running_server
    status, _ = call("POST", f"{base}/api/categories", {
        "code": "02", "title_zh": "新分類", "title_en": "New Cat", "focus": "f",
    })
    assert status == 200
    status, body = call("GET", f"{base}/api/categories")
    assert any(c["code"] == "02" for c in body["categories"])


def test_console_bridge_script_has_base_filled_in(running_server):
    base, _ = running_server
    req = urllib.request.Request(f"{base}/api/console-bridge-script")
    with urllib.request.urlopen(req) as r:
        text = r.read().decode()
    assert "__BASE__" not in text
    assert "/api/diagram/list" in text


def test_console_bridge_script_pre_targets_the_pending_new_drill(running_server):
    # next_drill_id is 2 in the fixture — the script must be ready to Save
    # to drill-02.svg immediately, without the user ever clicking 載入
    # (there is nothing to load for a brand-new drill).
    base, _ = running_server
    req = urllib.request.Request(f"{base}/api/console-bridge-script")
    with urllib.request.urlopen(req) as r:
        text = r.read().decode()
    assert "__TARGET__" not in text
    assert "let currentFile = 'drill-02.svg';" in text


def test_cors_headers_present_on_diagram_list(running_server):
    base, _ = running_server
    req = urllib.request.Request(f"{base}/api/diagram/list")
    with urllib.request.urlopen(req) as r:
        assert r.headers.get("Access-Control-Allow-Origin") == "*"


def test_options_preflight_on_diagram_file(running_server):
    base, _ = running_server
    req = urllib.request.Request(f"{base}/api/diagram/file", method="OPTIONS")
    with urllib.request.urlopen(req) as r:
        assert r.status == 204
        assert r.headers.get("Access-Control-Allow-Origin") == "*"


def test_commit_rejected_before_build(running_server):
    base, repo = running_server
    (repo / "content" / "sessions.yaml").write_text("export_defaults: {}\nsessions: []\n", encoding="utf-8")
    status, body = call("POST", f"{base}/api/commit", {"message": "test"})
    assert status == 409


def test_build_then_commit_succeeds(running_server):
    base, repo = running_server
    (repo / "content" / "sessions.yaml").write_text("export_defaults: {}\nsessions: []\n", encoding="utf-8")
    status, body = call("POST", f"{base}/api/build")
    assert status == 200 and body["ok"] is True
    status, body = call("POST", f"{base}/api/commit", {"message": "測試 commit"})
    assert status == 200 and "commit" in body


def test_commit_with_nothing_staged_returns_400(running_server):
    base, _ = running_server
    call("POST", f"{base}/api/build")
    status, body = call("POST", f"{base}/api/commit", {"message": "空的"})
    assert status == 400
