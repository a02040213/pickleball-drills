import subprocess
import pytest
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools" / "schedule-editor"))
from lib.git_ops import run_build, git_diff, git_commit, git_push, NothingToCommit


def run(cmd, cwd):
    subprocess.run(cmd, cwd=cwd, check=True, capture_output=True)


def make_repo(tmp_path, build_exit_code=0):
    repo = tmp_path / "repo"
    repo.mkdir()
    run(["git", "init"], repo)
    run(["git", "config", "user.email", "t@example.com"], repo)
    run(["git", "config", "user.name", "Test"], repo)
    (repo / "content").mkdir()
    (repo / "content" / "sessions.yaml").write_text("sessions: []\n")
    (repo / "assets" / "diagrams").mkdir(parents=True)
    (repo / "build.py").write_text(f"import sys; sys.exit({build_exit_code})\n")
    run(["git", "add", "-A"], repo)
    run(["git", "commit", "-m", "init"], repo)
    return repo


def test_run_build_ok_true_on_exit_zero(tmp_path):
    repo = make_repo(tmp_path, build_exit_code=0)
    ok, _ = run_build(repo)
    assert ok is True


def test_run_build_ok_false_on_nonzero_exit(tmp_path):
    repo = make_repo(tmp_path, build_exit_code=1)
    ok, _ = run_build(repo)
    assert ok is False


def test_git_commit_raises_when_nothing_staged(tmp_path):
    repo = make_repo(tmp_path)
    with pytest.raises(NothingToCommit):
        git_commit(repo, "沒有變更")


def test_git_commit_only_stages_content_and_diagrams(tmp_path):
    repo = make_repo(tmp_path)
    (repo / "content" / "sessions.yaml").write_text("sessions: [{}]\n")
    (repo / "README.md").write_text("unrelated change\n")  # outside the allowed scope
    commit_hash = git_commit(repo, "更新課表")
    changed = subprocess.run(
        ["git", "show", "--stat", "--format=", commit_hash], cwd=repo,
        capture_output=True, text=True, check=True,
    ).stdout
    assert "content/sessions.yaml" in changed
    assert "README.md" not in changed


def test_git_diff_scoped_to_content_and_diagrams(tmp_path):
    repo = make_repo(tmp_path)
    (repo / "content" / "sessions.yaml").write_text("sessions: [{}]\n")
    result = git_diff(repo)
    assert "sessions.yaml" in result["diff"]
    assert "sessions.yaml" in result["stat"]


def test_git_push_sends_commit_to_remote(tmp_path):
    bare = tmp_path / "remote.git"
    run(["git", "init", "--bare", str(bare)], tmp_path)
    repo = make_repo(tmp_path)
    run(["git", "remote", "add", "origin", str(bare)], repo)
    run(["git", "push", "-u", "origin", "HEAD"], repo)  # establish upstream once
    (repo / "content" / "sessions.yaml").write_text("sessions: [{}]\n")
    git_commit(repo, "更新課表")
    git_push(repo)
    log = subprocess.run(["git", "log", "-1", "--format=%s"], cwd=bare, capture_output=True, text=True, check=True).stdout
    assert log.strip() == "更新課表"
