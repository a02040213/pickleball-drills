import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import build as build_module
from build import render_export_text

DRILLS_BY_ID = {
    1: {"title_zh": "限制丁克", "title_en": "Restricted Dink",
        "points": ["控制丁克的高度、深度與落點。", "次要重點"]},
    2: {"title_zh": "正反拍交叉丁克", "title_en": "Forehand / Backhand Cross Dink", "points": [],
        "summary": "兩人在網前以 60–75% 力量截擊，只求球不落地、不求致勝。"},
    3: {"title_zh": "無題無簡述", "points": []},
}

DEFAULTS = {"header": "🏓 匹克球課表", "footer": "有事請提前跟我說，謝謝！"}


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


def test_full_session_with_defaults():
    text = render_export_text(make_session(), DRILLS_BY_ID, DEFAULTS)
    assert text == (
        "🏓 匹克球課表\n\n"
        "🔥 熱身 10 分鐘：兩兩一組熱身\n\n"
        "三人一組輪替\n\n"
        "1️⃣ *限制丁克 40 分鐘*\n"
        "Restricted Dink\n\n"
        "2️⃣ *正反拍交叉丁克 20 分鐘*\n"
        "兩人在網前以 60–75% 力量截擊，只求球不落地、不求致勝。\n\n"
        "⏱ 預估總時長：60 分鐘\n\n"
        "有事請提前跟我說，謝謝！"
    )


def test_block_detail_prefers_summary_over_title_en():
    session = make_session(blocks=[{"duration": "20 分鐘", "drill_id": 2}])
    text = render_export_text(session, DRILLS_BY_ID, DEFAULTS)
    assert "兩人在網前以 60–75% 力量截擊" in text
    assert "Forehand / Backhand Cross Dink" not in text


def test_block_falls_back_to_title_en_without_summary():
    session = make_session(blocks=[{"duration": "40 分鐘", "drill_id": 1}])
    text = render_export_text(session, DRILLS_BY_ID, DEFAULTS)
    assert "1️⃣ *限制丁克 40 分鐘*\nRestricted Dink" in text


def test_block_without_summary_or_title_en_omits_detail_line():
    session = make_session(blocks=[{"duration": "20 分鐘", "drill_id": 3}])
    text = render_export_text(session, DRILLS_BY_ID, DEFAULTS)
    assert "1️⃣ *無題無簡述 20 分鐘*\n\n" in text


def test_items_beyond_nine_fall_back_to_plain_numbering():
    blocks = [{"duration": "10 分鐘", "drill_id": 3} for _ in range(11)]
    session = make_session(blocks=blocks)
    text = render_export_text(session, DRILLS_BY_ID, DEFAULTS)
    assert "9️⃣ *無題無簡述 10 分鐘*" in text
    assert "🔟 *無題無簡述 10 分鐘*" in text
    assert "11. *無題無簡述 10 分鐘*" in text


def test_per_session_header_footer_overrides_defaults():
    session = make_session(export_header="🏐 球隊課表", export_footer="請準時到")
    text = render_export_text(session, DRILLS_BY_ID, DEFAULTS)
    assert text.startswith("🏐 球隊課表\n\n")
    assert text.endswith("請準時到")


def test_missing_rotation_note_omits_line():
    session = make_session(rotation_note=None)
    text = render_export_text(session, DRILLS_BY_ID, DEFAULTS)
    assert "三人一組輪替" not in text
    assert "🔥 熱身 10 分鐘：兩兩一組熱身\n\n1️⃣ *限制丁克 40 分鐘*" in text


def test_missing_total_omits_total_line():
    session = make_session(total=None)
    text = render_export_text(session, DRILLS_BY_ID, DEFAULTS)
    assert "預估總時長" not in text


def test_empty_header_and_footer_defaults_omit_those_sections():
    session = make_session(blocks=[], total=None)
    text = render_export_text(session, {}, {"header": "", "footer": ""})
    assert not text.startswith("\n")
    assert text.startswith("🔥 熱身")


def test_build_sessions_tolerates_null_export_defaults(tmp_path):
    from jinja2 import Environment, FileSystemLoader

    session = make_session(blocks=[], total=None)
    session["date"] = "2099-01-01"
    sessions_data = {"export_defaults": None, "sessions": [session]}
    env = Environment(loader=FileSystemLoader(str(build_module.ROOT / "templates")))
    build_module.build_sessions(sessions_data, DRILLS_BY_ID, "", env, tmp_path)
    assert (tmp_path / "schedule" / "2099-01-01.html").exists()
