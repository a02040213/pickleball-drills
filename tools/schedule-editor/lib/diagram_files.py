import re

NAME_RE = re.compile(r"^drill-\d+\.svg$")


def list_diagram_files(diagrams_dir):
    return sorted(f.name for f in diagrams_dir.iterdir() if NAME_RE.match(f.name))


def diagram_exists(diagrams_dir, drill_id):
    return (diagrams_dir / f"drill-{drill_id:02d}.svg").is_file()


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
