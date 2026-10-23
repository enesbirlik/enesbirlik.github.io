#!/usr/bin/env python3
"""Validate data/roadmap.json and copy it into the embedded fallback in index.html.

The page fetches data/roadmap.json at runtime and falls back to the copy inside
<script type="application/json" id="roadmap-fallback"> when that fails, so the
two must stay identical. The pre-commit hook in .githooks/ runs this
automatically; to run it by hand:

    python3 scripts/sync_roadmap.py           # sync
    python3 scripts/sync_roadmap.py --check   # only report whether they differ
"""
import datetime
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
JSON_PATH = ROOT / "data" / "roadmap.json"
HTML_PATH = ROOT / "index.html"
STATUSES = {"done", "active", "todo"}
BLOCK = re.compile(
    r'(<script type="application/json" id="roadmap-fallback">\n)(.*?)(\n[ \t]*</script>)', re.S
)


def validate(data):
    errors = []
    try:
        datetime.date.fromisoformat(data.get("updated", ""))
    except (TypeError, ValueError):
        errors.append('"updated" must be an ISO date (YYYY-MM-DD)')
    steps = data.get("steps")
    if not isinstance(steps, list) or not steps:
        return errors + ['"steps" must be a non-empty list']
    seen = set()
    for i, step in enumerate(steps):
        where = f"steps[{i}]"
        if not isinstance(step.get("id"), str) or step["id"] in seen:
            errors.append(f"{where}: missing or duplicate id")
        seen.add(step.get("id"))
        title = step.get("title") or {}
        for lang in ("tr", "en"):
            if not isinstance(title.get(lang), str) or not title[lang].strip():
                errors.append(f"{where}: missing title.{lang}")
        if step.get("status") not in STATUSES:
            errors.append(f"{where}: status must be one of {sorted(STATUSES)}")
        if "date" in step and not isinstance(step["date"], str):
            errors.append(f"{where}: date must be a string")
    return errors


def main():
    check_only = "--check" in sys.argv[1:]
    try:
        data = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        sys.exit(f"{JSON_PATH.name}: invalid JSON: {e}")
    errors = validate(data)
    if errors:
        sys.exit(f"{JSON_PATH.name}:\n  " + "\n  ".join(errors))

    html = HTML_PATH.read_text(encoding="utf-8")
    m = BLOCK.search(html)
    if not m:
        sys.exit('index.html: <script id="roadmap-fallback"> block not found')
    indent = re.match(r"[ \t]*", m.group(3).lstrip("\n")).group(0) + "  "
    body = "\n".join(indent + line if line else line
                     for line in JSON_PATH.read_text(encoding="utf-8").rstrip().split("\n"))
    if m.group(2) == body:
        print("roadmap fallback already in sync")
        return
    if check_only:
        sys.exit("roadmap fallback in index.html is out of sync; run scripts/sync_roadmap.py")
    HTML_PATH.write_text(html[:m.start(2)] + body + html[m.end(2):], encoding="utf-8")
    print("roadmap fallback updated in index.html")


if __name__ == "__main__":
    main()
