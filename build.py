#!/usr/bin/env python3
"""Render content/drills.yaml + content/sessions.yaml into public/."""
import argparse
import re
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
    return svg.replace("<svg ", '<svg class="court-icon" ', 1)


def minutes_of(label):
    if not label:
        return None
    m = re.search(r"(\d+)", label)
    return int(m.group(1)) if m else None


def build_index(data, css, env, output_dir, sessions):
    for cat in data["categories"]:
        for drill in cat["drills"]:
            if drill.get("diagram_file"):
                drill["diagram_svg"] = read_diagram_file(drill["diagram_file"])
            else:
                d = drill["diagram"]
                drill["diagram_svg"] = render_diagram(d["a"], d["b"], d["ball"], d["move"], drill["id"])

    template = env.get_template("page.html.jinja")
    html = template.render(
        site=data["site"],
        categories=data["categories"],
        schedule=data["schedule"],
        optimizations=data["optimizations"],
        sessions=sessions,
        css=css,
    )
    (output_dir / "index.html").write_text(html, encoding="utf-8")
    print(f"built {output_dir / 'index.html'}")


def build_sessions(sessions, drills_by_id, css, env, output_dir):
    schedule_dir = output_dir / "schedule"
    schedule_dir.mkdir(parents=True, exist_ok=True)
    template = env.get_template("session.html.jinja")

    for session in sessions:
        minutes = [minutes_of(session["warmup"].get("duration"))]
        minutes += [minutes_of(b.get("duration")) for b in session["blocks"]]
        session["total"] = f"{sum(minutes)} 分鐘" if all(m is not None for m in minutes) else None
        for block in session["blocks"]:
            block["drill"] = drills_by_id[block["drill_id"]]

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
    sessions = sessions_data["sessions"]
    css = (ROOT / "assets" / "style.css").read_text(encoding="utf-8")

    env = Environment(loader=FileSystemLoader(str(ROOT / "templates")))

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    drills_by_id = {drill["id"]: drill for cat in data["categories"] for drill in cat["drills"]}

    build_index(data, css, env, output_dir, sessions)
    build_sessions(sessions, drills_by_id, css, env, output_dir)


if __name__ == "__main__":
    main()
