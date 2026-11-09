import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from build import (
    DEFAULT_BRIEFING_MINUTES, DEFAULT_ROTATIONS,
    build_block_timer, build_timeline, rotation_seconds_list,
)


def test_rotation_seconds_list_splits_evenly():
    # (40 - 4) minutes = 36 minutes = 2160 seconds / 6 rotations = 360 each
    assert rotation_seconds_list(40, 4, 6) == [360, 360, 360, 360, 360, 360]


def test_rotation_seconds_list_puts_remainder_on_last_rotation():
    # 20 minutes = 1200 seconds / 7 rotations = 171 each, remainder 3 on the last
    assert rotation_seconds_list(20, 0, 7) == [171, 171, 171, 171, 171, 171, 174]
    assert sum(rotation_seconds_list(20, 0, 7)) == 20 * 60


def test_rotation_seconds_list_never_goes_negative_when_briefing_exceeds_duration():
    assert rotation_seconds_list(5, 10, 3) == [0, 0, 0]


def test_build_block_timer_uses_block_overrides():
    block = {"rotations": 4, "briefing": 2}
    drill = {"default_rotations": 6, "default_briefing": 5}
    timer = build_block_timer(block, drill, duration_minutes=20)
    assert timer["briefing_seconds"] == 2 * 60
    assert timer["rotation_seconds"] == rotation_seconds_list(20, 2, 4)


def test_build_block_timer_falls_back_to_drill_defaults():
    block = {}
    drill = {"default_rotations": 6, "default_briefing": 3}
    timer = build_block_timer(block, drill, duration_minutes=40)
    assert timer["briefing_seconds"] == 3 * 60
    assert timer["rotation_seconds"] == rotation_seconds_list(40, 3, 6)


def test_build_block_timer_falls_back_to_global_defaults():
    block = {}
    drill = {}
    timer = build_block_timer(block, drill, duration_minutes=20)
    assert timer["briefing_seconds"] == DEFAULT_BRIEFING_MINUTES * 60
    assert timer["rotation_seconds"] == rotation_seconds_list(20, DEFAULT_BRIEFING_MINUTES, DEFAULT_ROTATIONS)


def test_build_timeline_flattens_warmup_briefing_and_rotations():
    session = {
        "warmup": {"timer_seconds": 600},
        "blocks": [
            {"timer": {"briefing_seconds": 120, "rotation_seconds": [300, 300]}},
            {"timer": {"briefing_seconds": 0, "rotation_seconds": [400]}},
        ],
    }
    timeline = build_timeline(session)
    assert timeline == [
        {"type": "warmup", "seconds": 600},
        {"type": "briefing", "blockIndex": 0, "seconds": 120},
        {"type": "rotation", "blockIndex": 0, "rotationIndex": 0, "rotationsTotal": 2, "seconds": 300},
        {"type": "rotation", "blockIndex": 0, "rotationIndex": 1, "rotationsTotal": 2, "seconds": 300},
        {"type": "rotation", "blockIndex": 1, "rotationIndex": 0, "rotationsTotal": 1, "seconds": 400},
    ]


def test_build_timeline_skips_blocks_and_warmup_without_timer_data():
    session = {
        "warmup": {},  # no timer_seconds (e.g. unparseable duration)
        "blocks": [{}],  # no timer (e.g. unparseable duration)
    }
    assert build_timeline(session) == []
