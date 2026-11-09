#!/usr/bin/env python3
"""Render content/drills.yaml + content/sessions.yaml into public/."""
import argparse
import re
import shutil
from datetime import date
from pathlib import Path

import yaml
from jinja2 import Environment, FileSystemLoader

ROOT = Path(__file__).parent

ZONE_Y_BOTTOM = {"kitchen": 42, "transition": 54, "baseline": 66}
ZONE_Y_TOP = {"kitchen": 30, "transition": 18, "baseline": 6}

COURT_FRAME = (
    '<rect x="4" y="2" width="88" height="68" rx="4" fill="none" stroke="var(--line)"/>'
    '<line x1="4" y1="36" x2="92" y2="36" stroke="var(--ink)" stroke-width="2"/>'
)
KITCHEN_LINES = (
    '<line x1="4" y1="24" x2="92" y2="24" stroke="var(--line)" stroke-dasharray="2,2"/>'
    '<line x1="4" y1="48" x2="92" y2="48" stroke="var(--line)" stroke-dasharray="2,2"/>'
)
def _marker(uid, color):
    return (
        f'<marker id="{uid}" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">'
        f'<path d="M0,0 L6,3 L0,6 z" fill="{color}"/></marker>'
    )


def render_diagram(a_zone, b_zone, ball, move, uid):
    ball_marker = f"ball-ah-{uid}"
    move_marker = f"move-ah-{uid}"
    marker_defs = []
    if ball in ("straight", "diagonal", "lob"):
        marker_defs.append(_marker(ball_marker, "var(--sub)"))
    if move != "none":
        marker_defs.append(_marker(move_marker, "var(--purple)"))
    defs = f"<defs>{''.join(marker_defs)}</defs>" if marker_defs else ""

    if ball == "none" and move == "none":
        return f'<svg viewBox="0 0 96 72" class="court-icon" aria-hidden="true">{COURT_FRAME}</svg>'

    ax, bx = 48, 48
    if ball == "diagonal":
        ax, bx = 66, 30
    ay = ZONE_Y_BOTTOM[a_zone] if a_zone else 36
    by = ZONE_Y_TOP[b_zone] if b_zone else 36

    ball_svg = ""
    if ball == "lob":
        midx = (ax + bx) / 2
        topy = min(ay, by) - 26
        ball_svg = f'<path d="M{ax},{ay} Q{midx},{topy} {bx},{by}" fill="none" stroke="var(--sub)" stroke-width="2" marker-end="url(#{ball_marker})"/>'
    elif ball in ("straight", "diagonal"):
        ball_svg = f'<line x1="{ax}" y1="{ay}" x2="{bx}" y2="{by}" stroke="var(--sub)" stroke-width="2" marker-end="url(#{ball_marker})"/>'

    move_svg = ""
    if move != "none":
        who, kind = move.split("-")
        x = ax if who == "a" else bx
        zone_map = ZONE_Y_BOTTOM if who == "a" else ZONE_Y_TOP
        y_kitchen, y_baseline = zone_map["kitchen"], zone_map["baseline"]
        if kind == "advance":
            move_svg = f'<line x1="{x}" y1="{y_baseline}" x2="{x}" y2="{y_kitchen}" stroke="var(--purple)" stroke-width="2" stroke-dasharray="3,3" marker-end="url(#{move_marker})"/>'
        else:  # shuttle
            move_svg = f'<line x1="{x}" y1="{y_kitchen}" x2="{x}" y2="{y_baseline}" stroke="var(--purple)" stroke-width="2" stroke-dasharray="3,3" marker-end="url(#{move_marker})" marker-start="url(#{move_marker})"/>'

    dots = f'<circle cx="{ax}" cy="{ay}" r="5" fill="var(--accent)"/><circle cx="{bx}" cy="{by}" r="5" fill="var(--teal)"/>'
    return f'<svg viewBox="0 0 96 72" class="court-icon" aria-hidden="true">{defs}{COURT_FRAME}{KITCHEN_LINES}{move_svg}{ball_svg}{dots}</svg>'


def read_diagram_file(rel_path):
    """Inline a drillplot-exported SVG (see assets/diagrams/README.md)."""
    svg = (ROOT / "assets" / rel_path).read_text(encoding="utf-8")
    m = re.search(r'<svg[^>]*\bwidth="([\d.]+)"[^>]*\bheight="([\d.]+)"', svg)
    aspect_style = f' style="aspect-ratio:{m.group(1)}/{m.group(2)}"' if m else ""
    return svg.replace("<svg ", f'<svg class="court-icon"{aspect_style} ', 1)


KEYCAP_DIGITS = {
    1: "1️⃣", 2: "2️⃣", 3: "3️⃣", 4: "4️⃣", 5: "5️⃣",
    6: "6️⃣", 7: "7️⃣", 8: "8️⃣", 9: "9️⃣", 10: "🔟",
}


def _item_marker(n):
    return KEYCAP_DIGITS.get(n, f"{n}.")


def render_export_text(session, drills_by_id, defaults):
    custom_header = session.get("export_header")
    footer = session.get("export_footer") or defaults.get("footer") or ""

    warmup = session["warmup"]
    sections = []
    if custom_header:
        sections.append(custom_header)
    else:
        header_tpl = defaults.get("header") or ""
        if header_tpl:
            sections.append(header_tpl.format(date=session.get("date", ""), label=session.get("label", "")))
            base_url = defaults.get("base_url")
            if base_url:
                sections.append(f"課表詳細連結：{base_url.rstrip('/')}/schedule/{session.get('date', '')}.html")
    sections.append(f"🔥 熱身 {warmup['duration']}：{warmup['note']}")
    if session.get("rotation_note"):
        sections.append(session["rotation_note"])

    block_lines = []
    for i, block in enumerate(session["blocks"], start=1):
        drill = drills_by_id[block["drill_id"]]
        line = f"{_item_marker(i)} {drill['title_zh']} {block['duration']}"
        detail = drill.get("summary") or drill.get("title_en") or ""
        if detail:
            line += f"\n{detail}"
        block_lines.append(line)
    if block_lines:
        sections.append("\n\n".join(block_lines))

    if session.get("total"):
        sections.append(f"⏱ 預估總時長：{session['total']}")
    if footer:
        sections.append(footer)

    return "\n\n".join(sections)


def minutes_of(label):
    if not label:
        return None
    m = re.search(r"(\d+)", label)
    return int(m.group(1)) if m else None


DEFAULT_ROTATIONS = 3
DEFAULT_BRIEFING_MINUTES = 1


def rotation_seconds_list(duration_minutes, briefing_minutes, rotations):
    """Split (duration - briefing) evenly into `rotations` whole-second chunks.

    Any remainder from integer division goes into the last rotation so the
    chunks always sum to exactly (duration - briefing) * 60.
    """
    total_seconds = max((duration_minutes - briefing_minutes) * 60, 0)
    base, remainder = divmod(total_seconds, rotations)
    return [base] * (rotations - 1) + [base + remainder]


def build_block_timer(block, drill, duration_minutes):
    briefing_minutes = block.get("briefing", drill.get("default_briefing", DEFAULT_BRIEFING_MINUTES))
    rotations = block.get("rotations", drill.get("default_rotations", DEFAULT_ROTATIONS))
    return {
        "briefing_seconds": briefing_minutes * 60,
        "rotation_seconds": rotation_seconds_list(duration_minutes, briefing_minutes, rotations),
    }


def build_timeline(session):
    """Flatten warmup + each block's briefing/rotations into one ordered list of
    timer phases for the front-end countdown to step through."""
    timeline = []
    warmup_seconds = session["warmup"].get("timer_seconds")
    if warmup_seconds is not None:
        timeline.append({"type": "warmup", "seconds": warmup_seconds})

    for i, block in enumerate(session["blocks"]):
        timer = block.get("timer")
        if not timer:
            continue
        if timer["briefing_seconds"] > 0:
            timeline.append({"type": "briefing", "blockIndex": i, "seconds": timer["briefing_seconds"]})
        rotations_total = len(timer["rotation_seconds"])
        for r, seconds in enumerate(timer["rotation_seconds"]):
            timeline.append({
                "type": "rotation", "blockIndex": i,
                "rotationIndex": r, "rotationsTotal": rotations_total,
                "seconds": seconds,
            })
    return timeline


def build_index(data, css, env, output_dir, sessions):
    for cat in data["categories"]:
        for drill in cat["drills"]:
            if drill.get("diagram_file"):
                drill["diagram_svg"] = read_diagram_file(drill["diagram_file"])
            else:
                d = drill["diagram"]
                drill["diagram_svg"] = render_diagram(d["a"], d["b"], d["ball"], d["move"], drill["id"])

    today = date.today().isoformat()
    upcoming_sessions = sorted((s for s in sessions if s["date"] >= today), key=lambda s: s["date"])
    past_sessions = sorted((s for s in sessions if s["date"] < today), key=lambda s: s["date"], reverse=True)

    template = env.get_template("page.html.jinja")
    html = template.render(
        site=data["site"],
        categories=data["categories"],
        upcoming_sessions=upcoming_sessions,
        past_sessions=past_sessions,
        css=css,
    )
    (output_dir / "index.html").write_text(html, encoding="utf-8")
    print(f"built {output_dir / 'index.html'}")


def build_sessions(sessions_data, drills_by_id, css, env, output_dir):
    schedule_dir = output_dir / "schedule"
    schedule_dir.mkdir(parents=True, exist_ok=True)
    template = env.get_template("session.html.jinja")
    sessions = sessions_data["sessions"]

    for session in sessions:
        minutes = [minutes_of(session["warmup"].get("duration"))]
        minutes += [minutes_of(b.get("duration")) for b in session["blocks"]]
        session["total"] = f"{sum(minutes)} 分鐘" if all(m is not None for m in minutes) else None
        session["export_text"] = render_export_text(session, drills_by_id, sessions_data.get("export_defaults") or {})
        warmup_minutes = minutes_of(session["warmup"].get("duration"))
        if warmup_minutes is not None:
            session["warmup"]["timer_seconds"] = warmup_minutes * 60
        for block in session["blocks"]:
            block["drill"] = drills_by_id[block["drill_id"]]
            duration_minutes = minutes_of(block.get("duration"))
            if duration_minutes is not None:
                block["timer"] = build_block_timer(block, block["drill"], duration_minutes)
        session["timeline"] = build_timeline(session)

        html = template.render(session=session, css=css)
        out_path = schedule_dir / f"{session['date']}.html"
        out_path.write_text(html, encoding="utf-8")
        print(f"built {out_path}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", default=str(ROOT / "public"))
    args = parser.parse_args()

    data = yaml.safe_load((ROOT / "content" / "drills.yaml").read_text(encoding="utf-8"))
    sessions_data = yaml.safe_load((ROOT / "content" / "sessions.yaml").read_text(encoding="utf-8"))
    sessions_data["sessions"].sort(key=lambda s: s["date"], reverse=True)
    sessions = sessions_data["sessions"]
    css = (ROOT / "assets" / "style.css").read_text(encoding="utf-8")

    env = Environment(loader=FileSystemLoader(str(ROOT / "templates")))

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    drills_by_id = {drill["id"]: drill for cat in data["categories"] for drill in cat["drills"]}

    build_index(data, css, env, output_dir, sessions)
    build_sessions(sessions_data, drills_by_id, css, env, output_dir)
    shutil.copy(ROOT / "assets" / "og-image.png", output_dir / "og-image.png")


if __name__ == "__main__":
    main()
