#!/usr/bin/env python3
"""Render content/drills.yaml into public/index.html."""
import argparse
import shutil
from pathlib import Path

import yaml
from jinja2 import Environment, FileSystemLoader

ROOT = Path(__file__).parent


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", default=str(ROOT / "public"))
    args = parser.parse_args()

    data = yaml.safe_load((ROOT / "content" / "drills.yaml").read_text(encoding="utf-8"))
    css = (ROOT / "assets" / "style.css").read_text(encoding="utf-8")

    env = Environment(loader=FileSystemLoader(str(ROOT / "templates")))
    template = env.get_template("page.html.jinja")
    html = template.render(
        site=data["site"],
        categories=data["categories"],
        schedule=data["schedule"],
        optimizations=data["optimizations"],
        css=css,
    )

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "index.html").write_text(html, encoding="utf-8")
    print(f"built {output_dir / 'index.html'}")


if __name__ == "__main__":
    main()
