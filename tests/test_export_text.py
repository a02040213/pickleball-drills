import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from build import render_export_text

DRILLS_BY_ID = {
    1: {"title_zh": "限制丁克", "points": ["控制丁克的高度、深度與落點。", "次要重點"]},
    2: {"title_zh": "正反拍交叉丁克", "points": []},
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
        "🏐 40 分鐘｜限制丁克\n"
        "   💡 控制丁克的高度、深度與落點。\n\n"
        "🏐 20 分鐘｜正反拍交叉丁克\n\n"
        "⏱ 預估總時長：60 分鐘\n\n"
        "有事請提前跟我說，謝謝！"
    )


def test_block_with_empty_points_omits_highlight_line():
    text = render_export_text(make_session(), DRILLS_BY_ID, DEFAULTS)
    assert "🏐 20 分鐘｜正反拍交叉丁克\n\n" in text
    assert "🏐 20 分鐘｜正反拍交叉丁克\n   💡" not in text


def test_per_session_header_footer_overrides_defaults():
    session = make_session(export_header="🏐 球隊課表", export_footer="請準時到")
    text = render_export_text(session, DRILLS_BY_ID, DEFAULTS)
    assert text.startswith("🏐 球隊課表\n\n")
    assert text.endswith("請準時到")


def test_missing_rotation_note_omits_line():
    session = make_session(rotation_note=None)
    text = render_export_text(session, DRILLS_BY_ID, DEFAULTS)
    assert "三人一組輪替" not in text
    assert "🔥 熱身 10 分鐘：兩兩一組熱身\n\n🏐 40 分鐘" in text


def test_missing_total_omits_total_line():
    session = make_session(total=None)
    text = render_export_text(session, DRILLS_BY_ID, DEFAULTS)
    assert "預估總時長" not in text


def test_empty_header_and_footer_defaults_omit_those_sections():
    session = make_session(blocks=[], total=None)
    text = render_export_text(session, {}, {"header": "", "footer": ""})
    assert not text.startswith("\n")
    assert text.startswith("🔥 熱身")
