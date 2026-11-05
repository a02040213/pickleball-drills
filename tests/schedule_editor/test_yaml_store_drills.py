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
