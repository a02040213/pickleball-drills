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


def git_commit(repo_root, message):
    _git(repo_root, "add", "content", "assets/diagrams")
    staged = _git(repo_root, "diff", "--cached", "--quiet", check=False)
    if staged.returncode == 0:
        raise NothingToCommit("nothing staged in content/ or assets/diagrams/")
    _git(repo_root, "commit", "-m", message)
    return _git(repo_root, "rev-parse", "HEAD").stdout.strip()


def git_push(repo_root):
    result = _git(repo_root, "push", check=False)
    if result.returncode != 0:
        raise RuntimeError(result.stdout + result.stderr)
    return result.stdout + result.stderr
