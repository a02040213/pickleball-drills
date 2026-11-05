import yaml


def load_drills_doc(path):
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def save_drills_doc(doc, path):
    path.write_text(yaml.safe_dump(doc, allow_unicode=True, sort_keys=False), encoding="utf-8")


def list_categories(path):
    doc = load_drills_doc(path)
    return [{"code": c["code"], "title_zh": c["title_zh"]} for c in doc["categories"]]


def next_drill_id(path):
    doc = load_drills_doc(path)
    ids = [d["id"] for c in doc["categories"] for d in c["drills"]]
    return max(ids, default=0) + 1


def add_category(path, code, title_zh, title_en, focus):
    doc = load_drills_doc(path)
    if any(c["code"] == code for c in doc["categories"]):
        raise ValueError(f"category code already exists: {code}")
    doc["categories"].append({
        "code": code, "title_zh": title_zh, "title_en": title_en,
        "focus": focus, "drills": [],
    })
    save_drills_doc(doc, path)


def add_drill(path, category_code, drill):
    doc = load_drills_doc(path)
    category = next((c for c in doc["categories"] if c["code"] == category_code), None)
    if category is None:
        raise ValueError(f"unknown category code: {category_code}")
    existing_ids = {d["id"] for c in doc["categories"] for d in c["drills"]}
    if drill["id"] in existing_ids:
        raise ValueError(f"drill id already used: {drill['id']}")
    category["drills"].append(drill)
    save_drills_doc(doc, path)
