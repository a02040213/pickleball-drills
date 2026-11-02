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
def render_diagram(a_zone, b_zone, path, uid):
    marker_id = f"ah-{uid}"
    if path == "none":
        return f'<svg viewBox="0 0 96 72" class="court-icon" aria-hidden="true">{COURT_FRAME}</svg>'

    arrow_def = (
        f'<defs><marker id="{marker_id}" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">'
        '<path d="M0,0 L6,3 L0,6 z" fill="var(--sub)"/></marker></defs>'
    )
    marker_url = f"url(#{marker_id})"

    ax, bx = 48, 48
    if path == "diagonal":
        ax, bx = 66, 30
    ay = ZONE_Y_BOTTOM[a_zone]
    by = ZONE_Y_TOP[b_zone]

    extra = ""
    if path == "lob":
        midx = (ax + bx) / 2
        topy = min(ay, by) - 26
        extra = f'<path d="M{ax},{ay} Q{midx},{topy} {bx},{by}" fill="none" stroke="var(--sub)" stroke-width="2" marker-end="{marker_url}"/>'
    elif path == "shuttle":
        extra = f'<line x1="{bx}" y1="12" x2="{bx}" y2="30" stroke="var(--sub)" stroke-width="2" marker-end="{marker_url}" marker-start="{marker_url}"/>'
    elif path == "advance":
        extra = (
            f'<line x1="{ax}" y1="60" x2="{ax}" y2="44" stroke="var(--sub)" stroke-width="2" marker-end="{marker_url}"/>'
            f'<line x1="{ax}" y1="{ay}" x2="{bx}" y2="{by}" stroke="var(--sub)" stroke-width="1.5" stroke-dasharray="3,2" marker-end="{marker_url}"/>'
        )
    else:  # straight / diagonal
        extra = f'<line x1="{ax}" y1="{ay}" x2="{bx}" y2="{by}" stroke="var(--sub)" stroke-width="2" marker-end="{marker_url}"/>'

    dots = f'<circle cx="{ax}" cy="{ay}" r="5" fill="var(--accent)"/><circle cx="{bx}" cy="{by}" r="5" fill="var(--teal)"/>'
    return f'<svg viewBox="0 0 96 72" class="court-icon" aria-hidden="true">{arrow_def}{COURT_FRAME}{KITCHEN_LINES}{extra}{dots}</svg>'


def minutes_of(label):
    if not label:
        return None
    m = re.search(r"(\d+)", label)
    return int(m.group(1)) if m else None


def build_index(data, css, env, output_dir, sessions):
    for cat in data["categories"]:
        for drill in cat["drills"]:
            d = drill["diagram"]
            drill["diagram_svg"] = render_diagram(d["a"], d["b"], d["path"], drill["id"])

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


def build_sessions(sessions, css, env, output_dir):
    schedule_dir = output_dir / "schedule"
    schedule_dir.mkdir(parents=True, exist_ok=True)
    template = env.get_template("session.html.jinja")

    for session in sessions:
        minutes = [minutes_of(session["warmup"].get("duration"))]
        minutes += [minutes_of(b.get("duration")) for b in session["blocks"]]
        session["total"] = f"{sum(minutes)} 分鐘" if all(m is not None for m in minutes) else None

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

    build_index(data, css, env, output_dir, sessions)
    build_sessions(sessions, css, env, output_dir)


if __name__ == "__main__":
    main()
