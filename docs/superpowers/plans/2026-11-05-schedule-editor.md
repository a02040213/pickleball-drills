# Schedule Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `tools/schedule-editor/`, a LAN-only local web app that replaces hand-editing `content/sessions.yaml` and `content/drills.yaml` for adding/adjusting single-day schedules and adding drill-library entries (including their drillplot-drawn diagrams), with a built-in Test build / Diff / Commit & Push action bar.

**Architecture:** A stdlib `http.server` backend (`tools/schedule-editor/server.py`) exposes a small JSON API over four pure-ish library modules (`lib/yaml_store_sessions.py`, `lib/yaml_store_drills.py`, `lib/diagram_files.py`, `lib/git_ops.py`), each independently unit-testable against temp files/repos. A single vanilla-JS page (`static/`) drives the API. No new runtime dependencies.

**Tech Stack:** Python stdlib (`http.server`, `subprocess`, `socket`), existing `PyYAML`, vanilla JS/HTML/CSS, pytest for the four library modules and HTTP-level integration tests of `server.py`.

**Spec:** `docs/superpowers/specs/2026-11-05-schedule-editor-and-export-design.md` (功能 1 section)

## Global Constraints

- No new Python dependency; reuse stdlib `http.server` (spec, Constraints).
- `public/` is git-ignored and rebuilt by CI on push to `main` — Test build is a local sanity check only and must never be added to a commit (spec, Constraints).
- Commit & Push only ever stages `content/*.yaml` and `assets/diagrams/*.svg` (spec, Constraints).
- Server binds to a LAN-reachable address on port 8800 (distinct from `drillplot-bridge`'s 8799), but provides its own equivalent of that tool's `/list`/`/file` diagram endpoints so a separate `save-server.py` process isn't needed for this flow (spec, Constraints).
- Diagram filenames are restricted to `drill-<digits>.svg`, same guard as the existing bridge (spec, Constraints).
- The new-drill form only supports the drillplot/SVG diagram path; the `a/b/ball/move` parametric path stays in `build.py` unmodified but gets no UI entry point here (spec, decided-how).
- Drill id is auto-assigned as current max id + 1, computed fresh at save time (spec, decided-how).
- A new drill must belong to a category; creating a new category is supported (spec, decided-how).
- Session editing covers date/label/warmup/rotation_note/blocks (drill choice, duration, order) and whole-day deletion, via the same form fields as creation (spec, Goals, as amended).
- Saving a session whose date collides with a *different* existing session must prompt for confirmation before overwriting (spec, Goals, as amended).
- Commit & Push has a message field pre-filled with an auto-generated default, editable before submit (spec, Goals, as amended).
- Commit & Push is enabled only after the most recent Test build passed (spec, Goals).
- Security model is LAN-reachability only — no login, no auth token (spec, Non-goals).

## Review Focus

- A new drill names a `category_code` that doesn't exist (typo, stale dropdown) → reject with a clear error; never create a drill with no matching category section.
- Two concurrent "add drill" requests both read the same "next id" before either saves → the id must be recomputed and re-validated at the moment of writing, not trusted from an earlier read.
- Re-saving a session without changing its date must not be treated as a collision with itself — only a date that now matches a *different* session's date triggers the confirm-before-overwrite path.
- Calling Commit with nothing staged (double-click, or Commit after a Test build with no edits since the last commit) must fail with a clear "沒有可以 commit 的變更" message, not a raw git error or a silent no-op push.
- Saving a new drill whose diagram was never drawn (user skips the drillplot step) must be blocked until `assets/diagrams/drill-<id>.svg` actually exists — no drill is saved with a dangling `diagram_file` reference.

## File Structure

```
tools/schedule-editor/
  server.py                       # HTTP routing + static file serving
  lib/
    __init__.py
    yaml_store_sessions.py        # sessions.yaml CRUD + conflict detection
    yaml_store_drills.py          # drills.yaml CRUD (categories + drills, id allocation)
    diagram_files.py              # SVG read/list/write, same filename guard as drillplot-bridge
    git_ops.py                    # build / diff / commit / push subprocess wrappers
  static/
    index.html
    app.js
    style.css
    console-bridge.template.js    # drillplot console-bridge script, BASE filled in server-side
  README.md
tests/schedule_editor/
  test_yaml_store_sessions.py
  test_yaml_store_drills.py
  test_diagram_files.py
  test_git_ops.py
  test_server.py
```

---

## Task 1: `lib/yaml_store_sessions.py`

**Files:**
- Create: `tools/schedule-editor/lib/__init__.py` (empty)
- Create: `tools/schedule-editor/lib/yaml_store_sessions.py`
- Create: `tests/schedule_editor/test_yaml_store_sessions.py`

**Interfaces:**
- Produces:
  - `load_sessions_doc(path: Path) -> dict`
  - `save_sessions_doc(doc: dict, path: Path) -> None`
  - `list_sessions(path: Path) -> list[dict]` — `[{"date": str, "label": str}]` sorted by `date`
  - `get_session(path: Path, date: str) -> dict | None`
  - `class SessionConflict(Exception)` with attribute `.existing: dict`
  - `upsert_session(path: Path, session: dict, original_date: str | None = None, force: bool = False) -> None`
  - `delete_session(path: Path, date: str) -> None`

- [ ] **Step 1: Write the failing tests**

```python
import yaml
import pytest
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools" / "schedule-editor"))
from lib.yaml_store_sessions import (
    load_sessions_doc, save_sessions_doc, list_sessions, get_session,
    upsert_session, delete_session, SessionConflict,
)

def make_doc_file(tmp_path, sessions):
    path = tmp_path / "sessions.yaml"
    path.write_text(yaml.safe_dump({"export_defaults": {}, "sessions": sessions}, allow_unicode=True))
    return path

def test_list_sessions_sorted_by_date(tmp_path):
    path = make_doc_file(tmp_path, [
        {"date": "2026-11-13", "label": "11/13"},
        {"date": "2026-11-06", "label": "11/6"},
    ])
    assert [s["date"] for s in list_sessions(path)] == ["2026-11-06", "2026-11-13"]

def test_get_session_returns_none_when_missing(tmp_path):
    path = make_doc_file(tmp_path, [])
    assert get_session(path, "2099-01-01") is None

def test_upsert_new_session_appends(tmp_path):
    path = make_doc_file(tmp_path, [])
    upsert_session(path, {"date": "2026-12-01", "label": "12/1", "blocks": []})
    assert get_session(path, "2026-12-01")["label"] == "12/1"

def test_upsert_same_date_as_original_overwrites_without_conflict(tmp_path):
    path = make_doc_file(tmp_path, [{"date": "2026-11-06", "label": "11/6", "blocks": []}])
    upsert_session(path, {"date": "2026-11-06", "label": "改過的標籤", "blocks": []}, original_date="2026-11-06")
    assert get_session(path, "2026-11-06")["label"] == "改過的標籤"

def test_upsert_colliding_with_different_session_raises_without_force(tmp_path):
    path = make_doc_file(tmp_path, [{"date": "2026-11-06", "label": "11/6", "blocks": []}])
    with pytest.raises(SessionConflict) as exc:
        upsert_session(path, {"date": "2026-11-06", "label": "新的一天", "blocks": []}, original_date=None)
    assert exc.value.existing["label"] == "11/6"
    assert get_session(path, "2026-11-06")["label"] == "11/6"  # untouched

def test_upsert_colliding_with_force_overwrites(tmp_path):
    path = make_doc_file(tmp_path, [{"date": "2026-11-06", "label": "11/6", "blocks": []}])
    upsert_session(path, {"date": "2026-11-06", "label": "蓋過去了", "blocks": []}, original_date=None, force=True)
    assert get_session(path, "2026-11-06")["label"] == "蓋過去了"

def test_upsert_changing_date_removes_old_row(tmp_path):
    path = make_doc_file(tmp_path, [{"date": "2026-11-06", "label": "11/6", "blocks": []}])
    upsert_session(path, {"date": "2026-11-20", "label": "11/6", "blocks": []}, original_date="2026-11-06")
    assert get_session(path, "2026-11-06") is None
    assert get_session(path, "2026-11-20")["label"] == "11/6"

def test_delete_session_removes_it(tmp_path):
    path = make_doc_file(tmp_path, [{"date": "2026-11-06", "label": "11/6", "blocks": []}])
    delete_session(path, "2026-11-06")
    assert get_session(path, "2026-11-06") is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/schedule_editor/test_yaml_store_sessions.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'lib'`

- [ ] **Step 3: Implement `lib/yaml_store_sessions.py`**

```python
import yaml

class SessionConflict(Exception):
    def __init__(self, existing):
        super().__init__(f"session already exists for date {existing['date']}")
        self.existing = existing

def load_sessions_doc(path):
    return yaml.safe_load(path.read_text(encoding="utf-8")) or {"export_defaults": {}, "sessions": []}

def save_sessions_doc(doc, path):
    path.write_text(yaml.safe_dump(doc, allow_unicode=True, sort_keys=False), encoding="utf-8")

def list_sessions(path):
    doc = load_sessions_doc(path)
    return sorted(
        [{"date": s["date"], "label": s["label"]} for s in doc["sessions"]],
        key=lambda s: s["date"],
    )

def get_session(path, date):
    doc = load_sessions_doc(path)
    return next((s for s in doc["sessions"] if s["date"] == date), None)

def upsert_session(path, session, original_date=None, force=False):
    doc = load_sessions_doc(path)
    sessions = doc["sessions"]
    colliding = next((s for s in sessions if s["date"] == session["date"]), None)
    is_self = colliding is not None and session["date"] == original_date
    if colliding is not None and not is_self and not force:
        raise SessionConflict(colliding)

    sessions = [s for s in sessions if s["date"] not in (original_date, session["date"])]
    sessions.append(session)
    sessions.sort(key=lambda s: s["date"])
    doc["sessions"] = sessions
    save_sessions_doc(doc, path)

def delete_session(path, date):
    doc = load_sessions_doc(path)
    doc["sessions"] = [s for s in doc["sessions"] if s["date"] != date]
    save_sessions_doc(doc, path)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/schedule_editor/test_yaml_store_sessions.py -v`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add tools/schedule-editor/lib/__init__.py tools/schedule-editor/lib/yaml_store_sessions.py tests/schedule_editor/test_yaml_store_sessions.py
git commit -m "新增 schedule-editor 的 sessions.yaml 存取層"
```

---

## Task 2: `lib/yaml_store_drills.py`

**Files:**
- Create: `tools/schedule-editor/lib/yaml_store_drills.py`
- Create: `tests/schedule_editor/test_yaml_store_drills.py`

**Interfaces:**
- Consumes: none (independent of Task 1)
- Produces:
  - `load_drills_doc(path: Path) -> dict`
  - `save_drills_doc(doc: dict, path: Path) -> None`
  - `list_categories(path: Path) -> list[dict]` — `[{"code": str, "title_zh": str}]`
  - `next_drill_id(path: Path) -> int`
  - `add_category(path: Path, code: str, title_zh: str, title_en: str, focus: str) -> None` — raises `ValueError` if `code` already exists
  - `add_drill(path: Path, category_code: str, drill: dict) -> None` — raises `ValueError` if `category_code` is unknown or `drill["id"]` is already used by an existing drill

- [ ] **Step 1: Write the failing tests**

```python
import yaml
import pytest
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools" / "schedule-editor"))
from lib.yaml_store_drills import (
    load_drills_doc, list_categories, next_drill_id, add_category, add_drill,
)

def make_drills_file(tmp_path, categories):
    path = tmp_path / "drills.yaml"
    path.write_text(yaml.safe_dump({"site": {"title": "x"}, "categories": categories}, allow_unicode=True))
    return path

def test_next_drill_id_is_max_plus_one(tmp_path):
    path = make_drills_file(tmp_path, [
        {"code": "01", "title_zh": "A", "drills": [{"id": 1}, {"id": 3}]},
        {"code": "02", "title_zh": "B", "drills": [{"id": 2}]},
    ])
    assert next_drill_id(path) == 4

def test_next_drill_id_is_one_when_no_drills(tmp_path):
    path = make_drills_file(tmp_path, [])
    assert next_drill_id(path) == 1

def test_add_category_appends_new_section(tmp_path):
    path = make_drills_file(tmp_path, [])
    add_category(path, "09", "新分類", "New Category", "重點說明")
    cats = list_categories(path)
    assert {"code": "09", "title_zh": "新分類"} in cats

def test_add_category_rejects_duplicate_code(tmp_path):
    path = make_drills_file(tmp_path, [{"code": "01", "title_zh": "A", "drills": []}])
    with pytest.raises(ValueError):
        add_category(path, "01", "重複", "Dup", "x")

def test_add_drill_appends_under_category(tmp_path):
    path = make_drills_file(tmp_path, [{"code": "01", "title_zh": "A", "drills": []}])
    add_drill(path, "01", {"id": 1, "title_zh": "新招式", "title_en": "New Move",
                            "method": ["步驟一"], "points": ["重點一"],
                            "diagram_file": "diagrams/drill-01.svg"})
    doc = load_drills_doc(path)
    drills = doc["categories"][0]["drills"]
    assert drills[0]["title_zh"] == "新招式"
    assert "diagram" not in drills[0]

def test_add_drill_rejects_unknown_category(tmp_path):
    path = make_drills_file(tmp_path, [{"code": "01", "title_zh": "A", "drills": []}])
    with pytest.raises(ValueError):
        add_drill(path, "99", {"id": 1, "title_zh": "x", "title_en": "x", "method": [], "points": [], "diagram_file": "x"})

def test_add_drill_rejects_duplicate_id(tmp_path):
    path = make_drills_file(tmp_path, [{"code": "01", "title_zh": "A", "drills": [{"id": 1}]}])
    with pytest.raises(ValueError):
        add_drill(path, "01", {"id": 1, "title_zh": "x", "title_en": "x", "method": [], "points": [], "diagram_file": "x"})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/schedule_editor/test_yaml_store_drills.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'lib.yaml_store_drills'`

- [ ] **Step 3: Implement `lib/yaml_store_drills.py`**

```python
import yaml

def load_drills_doc(path):
    return yaml.safe_load(path.read_text(encoding="utf-8"))

def save_drills_doc(doc, path):
    path.write_text(yaml.safe_dump(doc, allow_unicode=True, sort_keys=False), encoding="utf-8")

def list_categories(path):
    doc = load_drills_doc(path)
    return [{"code": c["code"], "title_zh": c["title_zh"]} for c in doc["categories"]]

def next_drill_id(path):
    doc = load_drills_doc(path)
    ids = [d["id"] for c in doc["categories"] for d in c["drills"]]
    return max(ids, default=0) + 1

def add_category(path, code, title_zh, title_en, focus):
    doc = load_drills_doc(path)
    if any(c["code"] == code for c in doc["categories"]):
        raise ValueError(f"category code already exists: {code}")
    doc["categories"].append({
        "code": code, "title_zh": title_zh, "title_en": title_en,
        "focus": focus, "drills": [],
    })
    save_drills_doc(doc, path)

def add_drill(path, category_code, drill):
    doc = load_drills_doc(path)
    category = next((c for c in doc["categories"] if c["code"] == category_code), None)
    if category is None:
        raise ValueError(f"unknown category code: {category_code}")
    existing_ids = {d["id"] for c in doc["categories"] for d in c["drills"]}
    if drill["id"] in existing_ids:
        raise ValueError(f"drill id already used: {drill['id']}")
    category["drills"].append(drill)
    save_drills_doc(doc, path)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/schedule_editor/test_yaml_store_drills.py -v`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add tools/schedule-editor/lib/yaml_store_drills.py tests/schedule_editor/test_yaml_store_drills.py
git commit -m "新增 schedule-editor 的 drills.yaml 存取層"
```

---

## Task 3: `lib/diagram_files.py`

**Files:**
- Create: `tools/schedule-editor/lib/diagram_files.py`
- Create: `tests/schedule_editor/test_diagram_files.py`

**Interfaces:**
- Produces:
  - `list_diagram_files(diagrams_dir: Path) -> list[str]` — sorted filenames matching `drill-<digits>.svg`
  - `diagram_exists(diagrams_dir: Path, drill_id: int) -> bool`
  - `read_diagram_file(diagrams_dir: Path, name: str) -> str` — raises `ValueError` on a name that doesn't match the pattern, `FileNotFoundError` if the file doesn't exist
  - `write_diagram_file(diagrams_dir: Path, name: str, svg_text: str) -> None` — raises `ValueError` on a name that doesn't match the pattern

- [ ] **Step 1: Write the failing tests**

```python
import pytest
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools" / "schedule-editor"))
from lib.diagram_files import list_diagram_files, diagram_exists, read_diagram_file, write_diagram_file

def test_list_diagram_files_filters_by_pattern(tmp_path):
    (tmp_path / "drill-01.svg").write_text("<svg/>")
    (tmp_path / "drill-02.svg").write_text("<svg/>")
    (tmp_path / "notes.txt").write_text("x")
    assert list_diagram_files(tmp_path) == ["drill-01.svg", "drill-02.svg"]

def test_diagram_exists_true_and_false(tmp_path):
    (tmp_path / "drill-05.svg").write_text("<svg/>")
    assert diagram_exists(tmp_path, 5) is True
    assert diagram_exists(tmp_path, 6) is False

def test_write_then_read_round_trip(tmp_path):
    write_diagram_file(tmp_path, "drill-07.svg", "<svg>hi</svg>")
    assert read_diagram_file(tmp_path, "drill-07.svg") == "<svg>hi</svg>"

def test_write_rejects_bad_name(tmp_path):
    with pytest.raises(ValueError):
        write_diagram_file(tmp_path, "../evil.svg", "<svg/>")

def test_read_rejects_bad_name(tmp_path):
    with pytest.raises(ValueError):
        read_diagram_file(tmp_path, "evil.txt")

def test_read_missing_file_raises_not_found(tmp_path):
    with pytest.raises(FileNotFoundError):
        read_diagram_file(tmp_path, "drill-99.svg")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/schedule_editor/test_diagram_files.py -v`
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Implement `lib/diagram_files.py`**

Same filename guard as `tools/drillplot-bridge/save-server.py`:

```python
import re

NAME_RE = re.compile(r"^drill-\d+\.svg$")

def list_diagram_files(diagrams_dir):
    return sorted(f.name for f in diagrams_dir.iterdir() if NAME_RE.match(f.name))

def diagram_exists(diagrams_dir, drill_id):
    return (diagrams_dir / f"drill-{drill_id}.svg").is_file()

def read_diagram_file(diagrams_dir, name):
    if not NAME_RE.match(name):
        raise ValueError(f"bad diagram filename: {name}")
    path = diagrams_dir / name
    if not path.is_file():
        raise FileNotFoundError(name)
    return path.read_text(encoding="utf-8")

def write_diagram_file(diagrams_dir, name, svg_text):
    if not NAME_RE.match(name):
        raise ValueError(f"bad diagram filename: {name}")
    (diagrams_dir / name).write_text(svg_text, encoding="utf-8")
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/schedule_editor/test_diagram_files.py -v`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add tools/schedule-editor/lib/diagram_files.py tests/schedule_editor/test_diagram_files.py
git commit -m "新增 schedule-editor 的示意圖檔案存取層"
```

---

## Task 4: `lib/git_ops.py`

**Files:**
- Create: `tools/schedule-editor/lib/git_ops.py`
- Create: `tests/schedule_editor/test_git_ops.py`

**Interfaces:**
- Produces:
  - `run_build(repo_root: Path) -> tuple[bool, str]` — runs `python3 build.py --output-dir public` with `cwd=repo_root`; returns `(returncode == 0, combined stdout+stderr)`
  - `git_diff(repo_root: Path) -> dict` — `{"stat": str, "diff": str}`, both scoped to `-- content assets/diagrams`
  - `class NothingToCommit(Exception)`
  - `git_commit(repo_root: Path, message: str) -> str` — stages `content` and `assets/diagrams`, raises `NothingToCommit` if nothing is staged after that, else commits and returns the new commit hash
  - `git_push(repo_root: Path) -> str` — returns combined stdout+stderr; raises `RuntimeError(output)` if the push's return code is non-zero

- [ ] **Step 1: Write the failing tests**

```python
import subprocess
import pytest
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools" / "schedule-editor"))
from lib.git_ops import run_build, git_diff, git_commit, git_push, NothingToCommit

def run(cmd, cwd):
    subprocess.run(cmd, cwd=cwd, check=True, capture_output=True)

def make_repo(tmp_path, build_exit_code=0):
    repo = tmp_path / "repo"
    repo.mkdir()
    run(["git", "init"], repo)
    run(["git", "config", "user.email", "t@example.com"], repo)
    run(["git", "config", "user.name", "Test"], repo)
    (repo / "content").mkdir()
    (repo / "content" / "sessions.yaml").write_text("sessions: []\n")
    (repo / "assets" / "diagrams").mkdir(parents=True)
    (repo / "build.py").write_text(f"import sys; sys.exit({build_exit_code})\n")
    run(["git", "add", "-A"], repo)
    run(["git", "commit", "-m", "init"], repo)
    return repo

def test_run_build_ok_true_on_exit_zero(tmp_path):
    repo = make_repo(tmp_path, build_exit_code=0)
    ok, _ = run_build(repo)
    assert ok is True

def test_run_build_ok_false_on_nonzero_exit(tmp_path):
    repo = make_repo(tmp_path, build_exit_code=1)
    ok, _ = run_build(repo)
    assert ok is False

def test_git_commit_raises_when_nothing_staged(tmp_path):
    repo = make_repo(tmp_path)
    with pytest.raises(NothingToCommit):
        git_commit(repo, "沒有變更")

def test_git_commit_only_stages_content_and_diagrams(tmp_path):
    repo = make_repo(tmp_path)
    (repo / "content" / "sessions.yaml").write_text("sessions: [{}]\n")
    (repo / "README.md").write_text("unrelated change\n")  # outside the allowed scope
    commit_hash = git_commit(repo, "更新課表")
    changed = subprocess.run(
        ["git", "show", "--stat", "--format=", commit_hash], cwd=repo,
        capture_output=True, text=True, check=True,
    ).stdout
    assert "content/sessions.yaml" in changed
    assert "README.md" not in changed

def test_git_diff_scoped_to_content_and_diagrams(tmp_path):
    repo = make_repo(tmp_path)
    (repo / "content" / "sessions.yaml").write_text("sessions: [{}]\n")
    result = git_diff(repo)
    assert "sessions.yaml" in result["diff"]
    assert "sessions.yaml" in result["stat"]

def test_git_push_sends_commit_to_remote(tmp_path):
    bare = tmp_path / "remote.git"
    run(["git", "init", "--bare", str(bare)], tmp_path)
    repo = make_repo(tmp_path)
    run(["git", "remote", "add", "origin", str(bare)], repo)
    run(["git", "push", "-u", "origin", "HEAD"], repo)  # establish upstream once
    (repo / "content" / "sessions.yaml").write_text("sessions: [{}]\n")
    git_commit(repo, "更新課表")
    git_push(repo)
    log = subprocess.run(["git", "log", "-1", "--format=%s"], cwd=bare, capture_output=True, text=True, check=True).stdout
    assert log.strip() == "更新課表"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/schedule_editor/test_git_ops.py -v`
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Implement `lib/git_ops.py`**

```python
import subprocess

class NothingToCommit(Exception):
    pass

def run_build(repo_root):
    result = subprocess.run(
        ["python3", "build.py", "--output-dir", "public"],
        cwd=repo_root, capture_output=True, text=True,
    )
    return result.returncode == 0, result.stdout + result.stderr

def _git(repo_root, *args, check=True):
    return subprocess.run(
        ["git", *args], cwd=repo_root, capture_output=True, text=True, check=check,
    )

def git_diff(repo_root):
    stat = _git(repo_root, "diff", "--stat", "--", "content", "assets/diagrams").stdout
    diff = _git(repo_root, "diff", "--", "content", "assets/diagrams").stdout
    return {"stat": stat, "diff": diff}

def git_commit(repo_root, message):
    _git(repo_root, "add", "content", "assets/diagrams")
    staged = _git(repo_root, "diff", "--cached", "--quiet", check=False)
    if staged.returncode == 0:
        raise NothingToCommit("nothing staged in content/ or assets/diagrams/")
    _git(repo_root, "commit", "-m", message)
    return _git(repo_root, "rev-parse", "HEAD").stdout.strip()

def git_push(repo_root):
    result = _git(repo_root, "push", check=False)
    if result.returncode != 0:
        raise RuntimeError(result.stdout + result.stderr)
    return result.stdout + result.stderr
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/schedule_editor/test_git_ops.py -v`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add tools/schedule-editor/lib/git_ops.py tests/schedule_editor/test_git_ops.py
git commit -m "新增 schedule-editor 的 build/diff/commit/push 包裝"
```

---

## Task 5: `server.py` — HTTP routing, static serving, drillplot bridge, console-bridge script

**Files:**
- Create: `tools/schedule-editor/server.py`
- Create: `tools/schedule-editor/static/index.html` (minimal placeholder — real UI is Tasks 6-8)
- Create: `tools/schedule-editor/static/console-bridge.template.js`
- Create: `tests/schedule_editor/test_server.py`

**Interfaces:**
- Consumes: every function from Tasks 1-4 (`lib.yaml_store_sessions`, `lib.yaml_store_drills`, `lib.diagram_files`, `lib.git_ops`)
- Produces the full API surface Tasks 6-8's frontend will call:
  - `GET  /` and any other path under `static/` → that static file
  - `GET  /api/sessions` → `{"sessions": [...]}`
  - `GET  /api/sessions/<date>` → session dict, 404 if missing
  - `POST /api/sessions` body `{"session": {...}, "original_date": str|null, "force": bool}` → 200 `{"ok": true}` / 409 `{"error": "conflict", "existing": {...}}`
  - `DELETE /api/sessions/<date>` → 200 `{"ok": true}` / 404 `{"error": "not found"}`
  - `GET  /api/categories` → `{"categories": [...]}`
  - `POST /api/categories` body `{"code","title_zh","title_en","focus"}` → 200 `{"ok": true}` / 400 `{"error": str}`
  - `GET  /api/drills/next-id` → `{"next_id": int}`
  - `POST /api/drills` body `{"category_code","title_zh","title_en","method":[...],"points":[...]}` → 200 `{"ok": true, "id": int}` / 400 `{"error": str}`
  - `GET  /api/diagram/list` → `{"files": [...]}`
  - `GET  /api/diagram/file?name=` → raw SVG body, `Content-Type: image/svg+xml`
  - `POST /api/diagram/file?name=` → overwrite, body is raw SVG text or `{"svg": "..."}`
  - `GET  /api/diagram/exists?drill_id=` → `{"exists": bool}`
  - `GET  /api/console-bridge-script` → JS text, `Content-Type: application/javascript`
  - `POST /api/build` → `{"ok": bool, "output": str}`
  - `GET  /api/diff` → `{"stat": str, "diff": str}`
  - `GET  /api/commit/suggested-message` → `{"message": str}`
  - `POST /api/commit` body `{"message": str}` → 200 `{"ok": true, "commit": str}` / 409 `{"error": "尚未通過 Test build"}` / 400 `{"error": "沒有可以 commit 的變更"}`
  - `POST /api/push` → 200 `{"ok": true, "output": str}` / 500 `{"error": str}`

- [ ] **Step 1: Write `static/console-bridge.template.js`**

Copy `tools/drillplot-bridge/console-bridge.js` verbatim, then: replace the `const BASE = 'http://10.66.129.108:8799';` line with `const BASE = '__BASE__';`, and replace the two endpoint paths `${BASE}/list` → `${BASE}/api/diagram/list`, `${BASE}/file?name=` → `${BASE}/api/diagram/file?name=` (both occurrences of `/file?name=`), and the fallback save target `BASE + '/'` → `BASE + '/api/diagram/file'`.

- [ ] **Step 2: Write `static/index.html` placeholder**

```html
<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><title>課表編輯器</title></head>
<body><p>schedule-editor UI 尚未實作（見 Task 6-8）。API 已可用於 /api/*。</p></body>
</html>
```

- [ ] **Step 3: Write the failing tests in `tests/schedule_editor/test_server.py`**

```python
import json
import socket
import subprocess
import threading
import urllib.request
import urllib.error
import pytest
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools" / "schedule-editor"))
from server import AppState, ScheduleEditorServer, Handler

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
        "site: {title: x}\ncategories:\n- code: '01'\n  title_zh: A\n  title_en: A\n  focus: f\n  drills:\n  - id: 1\n    title_zh: 既有\n    title_en: Existing\n    method: []\n    points: []\n    diagram_file: diagrams/drill-1.svg\n",
        encoding="utf-8",
    )
    (repo / "assets" / "diagrams").mkdir(parents=True)
    (repo / "assets" / "diagrams" / "drill-1.svg").write_text("<svg/>")
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
    (repo / "assets" / "diagrams" / "drill-2.svg").write_text("<svg/>")
    status, body = call("POST", f"{base}/api/drills", {
        "category_code": "01", "title_zh": "新招式", "title_en": "New Move",
        "method": ["x"], "points": ["x"],
    })
    assert status == 200 and body["id"] == 2

def test_add_drill_ignores_client_supplied_id(running_server):
    base, repo = running_server
    (repo / "assets" / "diagrams" / "drill-2.svg").write_text("<svg/>")
    status, body = call("POST", f"{base}/api/drills", {
        "category_code": "01", "title_zh": "忽略這個 id", "title_en": "Ignore Id",
        "method": ["x"], "points": ["x"], "id": 999,
    })
    assert status == 200 and body["id"] == 2  # server recomputed it, not 999

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
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `pytest tests/schedule_editor/test_server.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'server'`

- [ ] **Step 5: Implement `server.py`**

```python
import json
import mimetypes
import re
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
    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
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
            date = path.removeprefix("/api/sessions/")
            session = sessions_store.get_session(state.sessions_path, date)
            return self._json(200, session) if session else self._json(404, {"error": "not found"})

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
            self.send_header("Content-Type", "image/svg+xml")
            self.end_headers()
            self.wfile.write(svg.encode("utf-8"))
            return

        if path == "/api/diagram/exists":
            drill_id = int(query.get("drill_id", ["0"])[0])
            return self._json(200, {"exists": diagram_files.diagram_exists(state.diagrams_dir, drill_id)})

        if path == "/api/console-bridge-script":
            template = (STATIC_DIR / "console-bridge.template.js").read_text(encoding="utf-8")
            script = template.replace("__BASE__", f"http://{detect_lan_ip()}:{PORT}")
            self.send_response(200)
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
            drill_id = drills_store.next_drill_id(state.drills_path)
            if not diagram_files.diagram_exists(state.diagrams_dir, drill_id):
                return self._json(400, {"error": f"diagram not found for drill-{drill_id}.svg — draw it in drillplot first"})
            drill = {
                "id": drill_id, "title_zh": body["title_zh"], "title_en": body["title_en"],
                "method": body["method"], "points": body["points"],
                "diagram_file": f"diagrams/drill-{drill_id}.svg",
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
            date = path.removeprefix("/api/sessions/")
            if sessions_store.get_session(state.sessions_path, date) is None:
                return self._json(404, {"error": "not found"})
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
```

One line on the approach where the test leaves a choice: `/api/drills` recomputes `next_drill_id` itself from the current file state rather than trusting any id the client sends — this is what Review Focus item 2 (concurrent add-drill race) requires, and it's also why the diagram-exists check happens before `add_drill`, using that freshly computed id.

- [ ] **Step 6: Run tests to verify they pass**

Run: `pytest tests/schedule_editor/test_server.py -v`
Expected: PASS (13 tests)

- [ ] **Step 7: Commit**

```bash
git add tools/schedule-editor/server.py tools/schedule-editor/static/index.html tools/schedule-editor/static/console-bridge.template.js tests/schedule_editor/test_server.py
git commit -m "新增 schedule-editor 的 HTTP server 與 API"
```

---

## Task 6: Frontend — 單日課表分頁

**Files:**
- Modify: `tools/schedule-editor/static/index.html`
- Create: `tools/schedule-editor/static/app.js`
- Create: `tools/schedule-editor/static/style.css`
- Modify: `tools/schedule-editor/server.py`, `tests/schedule_editor/test_server.py` (the missing `GET /api/drills` route — see Step 1)

**Interfaces:**
- Consumes: `GET/POST/DELETE /api/sessions*`, `GET /api/drills` (for the per-block drill picker — add a `GET /api/drills` route to Task 5's server if not already covered: return `{"drills": [{"id", "title_zh", "category_code"}]}` by flattening `drills_store.load_drills_doc()`; add this as a one-line addition to `server.py`'s `do_GET` alongside the existing routes, plus one HTTP test in `test_server.py` asserting the flattened shape — do this as the first step of this task since it was missed in Task 5's route list.)

- [ ] **Step 1: Add the missing `GET /api/drills` route and its test**

In `tests/schedule_editor/test_server.py`, add:
```python
def test_list_drills_flattened(running_server):
    base, _ = running_server
    status, body = call("GET", f"{base}/api/drills")
    assert status == 200
    assert body["drills"] == [{"id": 1, "title_zh": "既有", "category_code": "01"}]
```
Run: `pytest tests/schedule_editor/test_server.py::test_list_drills_flattened -v` — expect FAIL (404).

In `server.py`'s `do_GET`, add before the `/api/drills/next-id` branch:
```python
if path == "/api/drills":
    doc = drills_store.load_drills_doc(state.drills_path)
    flat = [{"id": d["id"], "title_zh": d["title_zh"], "category_code": c["code"]}
            for c in doc["categories"] for d in c["drills"]]
    return self._json(200, {"drills": flat})
```
Run the same test again — expect PASS.

- [ ] **Step 2: Build the sessions tab UI in `static/app.js` + `static/index.html`**

Behavior (no code transcript — this is UI wiring, not an algorithm the plan needs to fix):
- On load, `GET /api/sessions` and render a list (date + label), each row with "編輯" and "複製成新的一天" buttons, and a "新增一天" button.
- The session form (shared by new/edit/duplicate) has fields: date, label, warmup duration, warmup note, rotation_note, and a repeatable block row (drill picker populated from `GET /api/drills`, duration text input, up/down buttons to reorder, a delete-row button), plus an "新增項目" button to append a block row.
- "編輯": `GET /api/sessions/<date>`, fill the form, remember the loaded date as `original_date`.
- "複製成新的一天": same fetch, but leave `original_date` unset (null) and clear the `date` field so saving always goes through the collision check.
- "新增一天": empty form, `original_date` unset.
- Delete button on an edit view: `DELETE /api/sessions/<date>`, refresh the list.
- Save button: `POST /api/sessions` with `{session, original_date, force: false}`. On a 409 response, show the existing session's label in a confirm dialog ("已經有這天的課表（label），要覆蓋嗎？"); if confirmed, resubmit with `force: true`.
- After any successful save/delete, refresh the session list and clear `state.lastChange` tracking isn't needed client-side (server tracks it) — just re-fetch `GET /api/commit/suggested-message` so the action bar (Task 8) shows an up-to-date default next time it's opened.

- [ ] **Step 3: Manually verify**

Run: `python3 tools/schedule-editor/server.py` (from repo root, or adjust `root` resolution — note the `__main__` block in Task 5 assumes `server.py` lives three directories below repo root; verify this resolves to the actual repo root before running).

Open `http://localhost:8800/` and walk through: create a new day, edit an existing day's blocks (reorder, change duration, swap drill), duplicate a day onto an already-used date and confirm the overwrite prompt appears and works both ways (cancel leaves data untouched, confirm overwrites), delete a day.

- [ ] **Step 4: Commit**

```bash
git add tools/schedule-editor/server.py tools/schedule-editor/static/ tests/schedule_editor/test_server.py
git commit -m "schedule-editor：單日課表分頁"
```

---

## Task 7: Frontend — 課表大全分頁（含 drillplot 整合）

**Files:**
- Modify: `tools/schedule-editor/static/app.js`, `static/index.html`

**Interfaces:**
- Consumes: `GET/POST /api/categories`, `GET /api/drills/next-id`, `GET /api/diagram/exists`, `GET /api/console-bridge-script`, `POST /api/drills`

- [ ] **Step 1: Build the drills tab UI**

Behavior:
- Category select populated from `GET /api/categories`, plus a "+ 新增分類" option that reveals code/title_zh/title_en/focus fields and calls `POST /api/categories` before continuing.
- On tab open, `GET /api/drills/next-id` and display it as read-only ("將配發 #N").
- Fields: title_zh, title_en, a repeatable method-step list (add/remove rows), a repeatable points list (add/remove rows).
- A "開啟 drillplot + 複製連動腳本" button: `GET /api/console-bridge-script`, `navigator.clipboard.writeText()` the result, then `window.open("https://maikuru.github.io/drillplot/", "_blank")`.
- A "重新檢查" button: `GET /api/diagram/exists?drill_id=N` (N = the displayed next-id) and show "✅ 已找到 drill-N.svg" or "❌ 還沒畫好" next to it.
- "存檔" button disabled until the last "重新檢查" came back `true`; on click, `POST /api/drills` with `{category_code, title_zh, title_en, method, points}` (no `id` or `diagram_file` — the server assigns both). On success, clear the form and re-fetch the next id.

- [ ] **Step 2: Manually verify**

With the server running, add a brand-new drill end to end: pick/create a category, fill fields, draw a diagram via the drillplot flow (or, if not at a machine with a browser pointed at drillplot right now, write a matching `assets/diagrams/drill-<next-id>.svg` by hand to unblock "重新檢查" for this manual check), click "重新檢查" until it reports found, save, then confirm `content/drills.yaml` has the new entry with a `diagram_file` and no `diagram:` key, and `python3 build.py --output-dir /tmp/pico-check` renders it without error.

- [ ] **Step 3: Commit**

```bash
git add tools/schedule-editor/static/
git commit -m "schedule-editor：課表大全分頁與 drillplot 整合"
```

---

## Task 8: Frontend — 共用操作列（Test build / Diff / Commit & Push）

**Files:**
- Modify: `tools/schedule-editor/static/app.js`, `static/index.html`
- Modify: `tools/schedule-editor/server.py` (reset `state.build_ok = False` in the three mutation handlers — see Step 1)
- Modify: `tests/schedule_editor/test_server.py` (add the regression test in Step 2)

**Interfaces:**
- Consumes: `POST /api/build`, `GET /api/diff`, `GET /api/commit/suggested-message`, `POST /api/commit`, `POST /api/push`

- [ ] **Step 1: Build the action bar UI**

Behavior:
- Always visible (not inside either tab). Three buttons: "Test build", "Diff", "Commit & Push".
- "Test build": `POST /api/build`, show the `output` text and a pass/fail indicator. Enables the Commit & Push button only when `ok` is `true`; any further session/drill save re-disables it (client tracks a local `buildPassed` flag, set `false` again right after any successful `POST /api/sessions`, `DELETE /api/sessions/*`, or `POST /api/drills` call, so a stale pass from before the latest edit can't be used — this mirrors the server's own `state.build_ok`, which already gets reset implicitly because nothing resets it server-side today; **add this reset**: in `server.py`, set `state.build_ok = False` at the top of the `/api/sessions` POST, `/api/sessions/*` DELETE, and `/api/drills` POST handlers, right before their existing logic, so the server — not just the UI — enforces "must re-test after the latest edit." Add one test to `test_server.py` for this: save a session, run build, save another session, assert `POST /api/commit` now 409s even though a build ran earlier in the test).
- "Diff": `GET /api/diff`, show `stat` and `diff` in a scrollable panel.
- When Commit & Push is enabled: a message input pre-filled from `GET /api/commit/suggested-message` (re-fetched each time the panel is opened), editable; clicking "Commit & Push" calls `POST /api/commit` with the (possibly edited) message, and on success immediately calls `POST /api/push`, showing the result of each step.

- [ ] **Step 2: Add and run the build-reset regression test**

```python
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
```

Run: `pytest tests/schedule_editor/test_server.py -v`
Expected: PASS, including the new test (confirms the three reset points added in Step 1 all work)

- [ ] **Step 3: Manually verify**

Full walkthrough: make an edit, confirm Commit & Push is disabled; Test build; confirm it's enabled; Diff shows the edit; Commit & Push with the default message; confirm `git log -1` in the repo shows that message and only touched `content/`/`assets/diagrams/`.

- [ ] **Step 4: Commit**

```bash
git add tools/schedule-editor/server.py tools/schedule-editor/static/ tests/schedule_editor/test_server.py
git commit -m "schedule-editor：共用操作列（test build / diff / commit & push）"
```

---

## Task 9: `tools/schedule-editor/README.md`

**Files:**
- Create: `tools/schedule-editor/README.md`

**Interfaces:** none — documentation only.

- [ ] **Step 1: Write the README**

Mirror `tools/drillplot-bridge/README.md`'s structure and tone: what this replaces (manual YAML editing + the separate drillplot-bridge run for new drills), how to run it (`python3 tools/schedule-editor/server.py`, binds `0.0.0.0:8800`), the one-paragraph new-drill-with-diagram flow (fill fields → next id shown → "開啟 drillplot + 複製連動腳本" → draw and save in the drillplot tab → "重新檢查" → 存檔), and a note that `tools/drillplot-bridge/` still exists separately for touching up an *existing* drill's diagram without going through this tool.

- [ ] **Step 2: Commit**

```bash
git add tools/schedule-editor/README.md
git commit -m "新增 schedule-editor 使用說明"
```
