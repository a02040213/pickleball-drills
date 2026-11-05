import yaml
import pytest
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools" / "schedule-editor"))
from lib.yaml_store_drills import (
    load_drills_doc, list_categories, next_drill_id, add_category, add_drill,
    get_drill, update_drill,
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


def test_get_drill_returns_drill_with_its_category_code(tmp_path):
    path = make_drills_file(tmp_path, [
        {"code": "01", "title_zh": "A", "drills": [
            {"id": 1, "title_zh": "招式一", "title_en": "Move 1", "method": ["m"], "points": ["p"], "diagram_file": "diagrams/drill-01.svg"},
        ]},
    ])
    drill = get_drill(path, 1)
    assert drill["title_zh"] == "招式一"
    assert drill["category_code"] == "01"


def test_get_drill_returns_none_when_missing(tmp_path):
    path = make_drills_file(tmp_path, [{"code": "01", "title_zh": "A", "drills": []}])
    assert get_drill(path, 999) is None


def test_update_drill_changes_fields_in_place(tmp_path):
    path = make_drills_file(tmp_path, [
        {"code": "01", "title_zh": "A", "drills": [
            {"id": 1, "title_zh": "舊名稱", "title_en": "Old", "method": ["old"], "points": ["old"], "diagram_file": "diagrams/drill-01.svg"},
        ]},
    ])
    update_drill(path, 1, category_code="01", title_zh="新名稱", title_en="New",
                  method=["new step"], points=["new point"])
    doc = load_drills_doc(path)
    drill = doc["categories"][0]["drills"][0]
    assert drill["title_zh"] == "新名稱"
    assert drill["method"] == ["new step"]
    assert drill["diagram_file"] == "diagrams/drill-01.svg"  # untouched by a text-only edit


def test_update_drill_moves_between_categories(tmp_path):
    path = make_drills_file(tmp_path, [
        {"code": "01", "title_zh": "A", "drills": [
            {"id": 1, "title_zh": "招式", "title_en": "Move", "method": [], "points": [], "diagram_file": "diagrams/drill-01.svg"},
        ]},
        {"code": "02", "title_zh": "B", "drills": []},
    ])
    update_drill(path, 1, category_code="02", title_zh="招式", title_en="Move", method=[], points=[])
    doc = load_drills_doc(path)
    assert doc["categories"][0]["drills"] == []
    assert doc["categories"][1]["drills"][0]["id"] == 1


def test_update_drill_rejects_unknown_id(tmp_path):
    path = make_drills_file(tmp_path, [{"code": "01", "title_zh": "A", "drills": []}])
    with pytest.raises(ValueError):
        update_drill(path, 999, category_code="01", title_zh="x", title_en="x", method=[], points=[])


def test_update_drill_rejects_unknown_category(tmp_path):
    path = make_drills_file(tmp_path, [
        {"code": "01", "title_zh": "A", "drills": [
            {"id": 1, "title_zh": "x", "title_en": "x", "method": [], "points": [], "diagram_file": "diagrams/drill-01.svg"},
        ]},
    ])
    with pytest.raises(ValueError):
        update_drill(path, 1, category_code="99", title_zh="x", title_en="x", method=[], points=[])
