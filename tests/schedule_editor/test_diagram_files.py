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
