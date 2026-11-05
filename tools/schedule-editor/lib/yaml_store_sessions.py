import yaml


class SessionConflict(Exception):
    def __init__(self, existing):
        super().__init__(f"session already exists for date {existing['date']}")
        self.existing = existing


def load_sessions_doc(path):
    return yaml.safe_load(path.read_text(encoding="utf-8")) or {"export_defaults": {}, "sessions": []}


def save_sessions_doc(doc, path):
    path.write_text(yaml.safe_dump(doc, allow_unicode=True, sort_keys=False), encoding="utf-8")


def list_sessions(path):
    doc = load_sessions_doc(path)
    return sorted(
        [{"date": s["date"], "label": s["label"]} for s in doc["sessions"]],
        key=lambda s: s["date"],
    )


def get_session(path, date):
    doc = load_sessions_doc(path)
    return next((s for s in doc["sessions"] if s["date"] == date), None)


def upsert_session(path, session, original_date=None, force=False):
    doc = load_sessions_doc(path)
    sessions = doc["sessions"]
    colliding = next((s for s in sessions if s["date"] == session["date"]), None)
    is_self = colliding is not None and session["date"] == original_date
    if colliding is not None and not is_self and not force:
        raise SessionConflict(colliding)

    sessions = [s for s in sessions if s["date"] not in (original_date, session["date"])]
    sessions.append(session)
    sessions.sort(key=lambda s: s["date"])
    doc["sessions"] = sessions
    save_sessions_doc(doc, path)


def delete_session(path, date):
    doc = load_sessions_doc(path)
    doc["sessions"] = [s for s in doc["sessions"] if s["date"] != date]
    save_sessions_doc(doc, path)
