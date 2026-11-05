# Session Export Text Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "複製文字" button to each rendered single-day schedule page (`schedule/<date>.html`) that copies a simplified, LINE-note-friendly plain-text summary of that day's schedule to the clipboard.

**Architecture:** `build.py` computes the export text once per session at build time (pure function, no new dependency) and embeds it in the rendered HTML as a JS string; a small inline script on the page copies that string via `navigator.clipboard.writeText()` with visible success/failure feedback.

**Tech Stack:** Python (existing Jinja2 + PyYAML stack), vanilla JS, pytest for the pure-function tests (already installed in the dev environment; no `requirements.txt` change).

**Spec:** `docs/superpowers/specs/2026-11-05-schedule-editor-and-export-design.md` (功能 2 section)

## Global Constraints

- Export covers single-day schedules only — no export for the drill library (spec, 功能 2 last bullet).
- Content is simplified: time + drill title + one highlight line per block, not the full `method` list (spec, Anti-goals).
- Highlight line defaults to the drill's first `points` entry; no backfill of a dedicated export field onto existing drills (spec, Non-goals).
- Header/footer are configurable: one site-wide default plus an optional per-session override (spec, 功能 2).
- Target paste destination is LINE notes: emoji + short text, not markdown syntax (spec, 功能 2).
- No new Python dependency; `public/` stays git-ignored and is not part of this change's test surface.

## Review Focus

- A session has no per-session `export_header`/`export_footer` and `export_defaults` is missing or empty in `sessions.yaml` → text must render with no header/footer lines, not `None` or a YAML error.
- A block's drill has an empty `points` list → that block's highlight line is omitted, not a crash on `points[0]`.
- A session's `warmup`/block durations aren't parseable by `minutes_of()` (so `session["total"]` is `None`, same as the existing HTML page's behavior) → the total line is omitted from the export text, matching what the page already does.
- The export text contains characters HTML-unsafe if embedded naively (e.g. a footer with `</script>`, `&`, or a straight quote) → must be embedded via Jinja's `tojson` filter so it round-trips as a valid JS string, not string-concatenated into a `<script>` body.
- `navigator.clipboard.writeText()` rejects (clipboard permission denied, or button hit twice fast) → the button must show a visible failure state instead of doing nothing, so Willy knows to copy manually.

---

## Task 1: `render_export_text()` pure function + tests

**Files:**
- Modify: `build.py` (add function near `minutes_of()`, call it inside `build_sessions()`)
- Create: `tests/test_export_text.py`
- Modify: `content/sessions.yaml` (add top-level `export_defaults:` block)

**Interfaces:**
- Produces: `render_export_text(session: dict, drills_by_id: dict) -> str`, called from `build_sessions()` after `session["total"]` is computed, assigning the result to `session["export_text"]` before the template renders.

- [ ] **Step 1: Add `export_defaults` to `content/sessions.yaml`**

At the top of the file, alongside the existing `sessions:` key:

```yaml
export_defaults:
  header: "🏓 匹克球課表"
  footer: "有事請提前跟我說，謝謝！"
sessions:
  ...
```

- [ ] **Step 2: Write the failing tests in `tests/test_export_text.py`**

```python
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from build import render_export_text

DRILLS_BY_ID = {
    1: {"title_zh": "限制丁克", "points": ["控制丁克的高度、深度與落點。", "次要重點"]},
    2: {"title_zh": "正反拍交叉丁克", "points": []},
}

def make_session(**overrides):
    base = {
        "label": "11/6",
        "warmup": {"duration": "10 分鐘", "note": "兩兩一組熱身"},
        "rotation_note": "三人一組輪替",
        "blocks": [
            {"duration": "40 分鐘", "drill_id": 1},
            {"duration": "20 分鐘", "drill_id": 2},
        ],
        "total": "60 分鐘",
        "export_header": None,
        "export_footer": None,
    }
    base.update(overrides)
    return base

DEFAULTS = {"header": "🏓 匹克球課表", "footer": "有事請提前跟我說，謝謝！"}

def test_full_session_with_defaults():
    text = render_export_text(make_session(), DRILLS_BY_ID, DEFAULTS)
    assert text == (
        "🏓 匹克球課表\n\n"
        "🔥 熱身 10 分鐘：兩兩一組熱身\n\n"
        "三人一組輪替\n\n"
        "🏐 40 分鐘｜限制丁克\n"
        "   💡 控制丁克的高度、深度與落點。\n\n"
        "🏐 20 分鐘｜正反拍交叉丁克\n\n"
        "⏱ 預估總時長：60 分鐘\n\n"
        "有事請提前跟我說，謝謝！"
    )

def test_block_with_empty_points_omits_highlight_line():
    text = render_export_text(make_session(), DRILLS_BY_ID, DEFAULTS)
    assert "🏐 20 分鐘｜正反拍交叉丁克\n\n" in text
    assert "🏐 20 分鐘｜正反拍交叉丁克\n   💡" not in text

def test_per_session_header_footer_overrides_defaults():
    session = make_session(export_header="🏐 球隊課表", export_footer="請準時到")
    text = render_export_text(session, DRILLS_BY_ID, DEFAULTS)
    assert text.startswith("🏐 球隊課表\n\n")
    assert text.endswith("請準時到")

def test_missing_rotation_note_omits_line():
    session = make_session(rotation_note=None)
    text = render_export_text(session, DRILLS_BY_ID, DEFAULTS)
    assert "三人一組輪替" not in text
    assert "🔥 熱身 10 分鐘：兩兩一組熱身\n\n🏐 40 分鐘" in text

def test_missing_total_omits_total_line():
    session = make_session(total=None)
    text = render_export_text(session, DRILLS_BY_ID, DEFAULTS)
    assert "預估總時長" not in text

def test_empty_header_and_footer_defaults_omit_those_sections():
    text = render_export_text(make_session(), {}, {"header": "", "footer": ""})
    assert not text.startswith("\n")
    assert "🔥 熱身" in text
```

Note: `test_empty_header_and_footer_defaults_omit_those_sections` passes an empty `drills_by_id` on purpose — with no defaults and no per-session override, header/footer are blank, and the session's own blocks (`drill_id` 1, 2) won't resolve; adjust the fixture to a session with no blocks for that one test case:

```python
def test_empty_header_and_footer_defaults_omit_those_sections():
    session = make_session(blocks=[], total=None)
    text = render_export_text(session, {}, {"header": "", "footer": ""})
    assert not text.startswith("\n")
    assert text.startswith("🔥 熱身")
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pytest tests/test_export_text.py -v`
Expected: FAIL with `ImportError: cannot import name 'render_export_text'`

- [ ] **Step 4: Implement `render_export_text(session: dict, drills_by_id: dict, defaults: dict) -> str` in `build.py`**

```python
def render_export_text(session, drills_by_id, defaults):
    header = session.get("export_header") or defaults.get("header") or ""
    footer = session.get("export_footer") or defaults.get("footer") or ""

    warmup = session["warmup"]
    sections = []
    if header:
        sections.append(header)
    sections.append(f"🔥 熱身 {warmup['duration']}：{warmup['note']}")
    if session.get("rotation_note"):
        sections.append(session["rotation_note"])

    block_lines = []
    for block in session["blocks"]:
        drill = drills_by_id[block["drill_id"]]
        line = f"🏐 {block['duration']}｜{drill['title_zh']}"
        if drill.get("points"):
            line += f"\n   💡 {drill['points'][0]}"
        block_lines.append(line)
    if block_lines:
        sections.append("\n\n".join(block_lines))

    if session.get("total"):
        sections.append(f"⏱ 預估總時長：{session['total']}")
    if footer:
        sections.append(footer)

    return "\n\n".join(sections)
```

Wire it into `build_sessions()` in `build.py`, right after the existing `session["total"] = ...` line:

```python
session["export_text"] = render_export_text(session, drills_by_id, sessions_data.get("export_defaults", {}))
```

This requires `build_sessions()` to receive `sessions_data` (the full parsed dict, not just `sessions_data["sessions"]`) — adjust its signature and the call site in `main()` accordingly: `build_sessions(sessions_data, drills_by_id, css, env, output_dir)`, and inside the function use `sessions = sessions_data["sessions"]` for the existing loop.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pytest tests/test_export_text.py -v`
Expected: PASS (7 tests)

- [ ] **Step 6: Commit**

```bash
git add build.py content/sessions.yaml tests/test_export_text.py
git commit -m "新增匯出純文字課表的 render_export_text()"
```

---

## Task 2: Wire the "複製文字" button into the session page template

**Files:**
- Modify: `templates/session.html.jinja`

**Interfaces:**
- Consumes: `session.export_text` (produced by Task 1), already a plain Python string available in the Jinja context.

- [ ] **Step 1: Add the button and embedded text to `templates/session.html.jinja`**

Add inside the `<div class="hero">` block (after the `<h1>`), using Jinja's `tojson` filter so the string is embedded as a safe JS literal regardless of quotes/emoji/newlines inside it:

```html
<button id="copy-export-btn" type="button">複製文字</button>
<span id="copy-export-status" aria-live="polite"></span>
<script>
(function () {
  var text = {{ session.export_text | tojson }};
  var btn = document.getElementById("copy-export-btn");
  var status = document.getElementById("copy-export-status");
  btn.addEventListener("click", function () {
    navigator.clipboard.writeText(text).then(function () {
      status.textContent = "已複製！";
    }, function () {
      status.textContent = "複製失敗，請手動選取文字";
    });
  });
})();
</script>
```

- [ ] **Step 2: Build and manually verify**

Run: `python3 build.py --output-dir /tmp/pico-check`
Expected: exits 0, prints `built /tmp/pico-check/schedule/2026-11-06.html` and `built /tmp/pico-check/schedule/2026-11-13.html`

Open `/tmp/pico-check/schedule/2026-11-06.html` in a browser, click "複製文字", paste into a text editor, and confirm the pasted text matches the format from Task 1's tests (header, warmup, blocks with highlight lines, total, footer) — this is the deliverable's acceptance check since there is no headless-browser test harness in this project.

Also temporarily set `export_footer: "test <script>&\"quote\""` on one session in `content/sessions.yaml`, rebuild, and confirm the page still loads (no broken `<script>` tag) and the copied text contains that literal string — this exercises the `tojson` escaping. Revert the temporary edit afterward.

- [ ] **Step 3: Commit**

```bash
git add templates/session.html.jinja
git commit -m "課表頁加上複製文字按鈕"
```
