import subprocess


class NothingToCommit(Exception):
    pass


def run_build(repo_root):
    result = subprocess.run(
        ["python3", "build.py", "--output-dir", "public"],
        cwd=repo_root, capture_output=True, text=True,
    )
    return result.returncode == 0, result.stdout + result.stderr


def _git(repo_root, *args, check=True):
    return subprocess.run(
        ["git", *args], cwd=repo_root, capture_output=True, text=True, check=check,
    )


def git_diff(repo_root):
    stat = _git(repo_root, "diff", "--stat", "--", "content", "assets/diagrams").stdout
    diff = _git(repo_root, "diff", "--", "content", "assets/diagrams").stdout
    return {"stat": stat, "diff": diff}


def _allowed(path):
    return path.startswith("content/") or path.startswith("assets/diagrams/")


def git_commit(repo_root, message):
    _git(repo_root, "add", "content", "assets/diagrams")

    # Anything staged outside content/ and assets/diagrams/ (e.g. pre-staged
    # by something else before this call) must not ride along in this commit.
    # Unstage it for the duration of the commit, then restore it staged
    # afterward — nothing the caller already staged is lost or committed.
    staged_paths = _git(repo_root, "diff", "--cached", "--name-only").stdout.splitlines()
    foreign = [p for p in staged_paths if not _allowed(p)]
    if foreign:
        _git(repo_root, "reset", "--", *foreign)

    staged = _git(repo_root, "diff", "--cached", "--quiet", "--", "content", "assets/diagrams", check=False)
    if staged.returncode == 0:
        if foreign:
            _git(repo_root, "add", "--", *foreign)
        raise NothingToCommit("nothing staged in content/ or assets/diagrams/")

    _git(repo_root, "commit", "-m", message)
    if foreign:
        _git(repo_root, "add", "--", *foreign)
    return _git(repo_root, "rev-parse", "HEAD").stdout.strip()


def git_push(repo_root):
    result = _git(repo_root, "push", check=False)
    if result.returncode != 0:
        raise RuntimeError(result.stdout + result.stderr)
    return result.stdout + result.stderr
