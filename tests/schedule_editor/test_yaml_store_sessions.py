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
