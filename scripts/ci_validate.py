#!/usr/bin/env python3
import glob
import json
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
failures = []


def check(label, ok, detail=""):
    status = "PASS" if ok else "FAIL"
    message = f"{status}: {label}"
    if detail:
        message += f" - {detail}"
    print(message)
    if not ok:
        failures.append(label)


metadata = json.loads((ROOT / "metadata.json").read_text())
schema_tree = ET.parse(ROOT / "schemas/org.gnome.shell.extensions.the-dock.gschema.xml")
schema_root = schema_tree.getroot()
schema_id = schema_root.find("schema").get("id")
schema_keys = {key.get("name") for key in schema_root.findall(".//key")}

check("metadata uuid is set", bool(metadata.get("uuid")))
check("metadata settings-schema matches schema", metadata.get("settings-schema") == schema_id)
check("metadata schema-id matches schema", metadata.get("schema-id") == schema_id)
check("compiled schema is present", (ROOT / "schemas/gschemas.compiled").is_file())

keys_source = (ROOT / "preferences/keys.js").read_text()
preference_keys = set(
    re.findall(r"^\s{4}'([A-Za-z0-9-]+)':\s*\{\s*default_value", keys_source, re.M)
)
unknown_keys = sorted(preference_keys - schema_keys)
check("preference keys are in the schema", not unknown_keys, ", ".join(unknown_keys))

for filename in sorted(glob.glob(str(ROOT / "ui/**/*.ui"), recursive=True)):
    label = f"UI XML: {Path(filename).relative_to(ROOT)}"
    try:
        ET.parse(filename)
        check(label, True)
    except ET.ParseError as exc:
        check(label, False, str(exc))

try:
    result = subprocess.run(
        ["glib-compile-schemas", "--strict", "--dry-run", str(ROOT / "schemas")],
        capture_output=True,
        text=True,
    )
    check("strict schema compile", result.returncode == 0, (result.stderr or result.stdout).strip())
except FileNotFoundError:
    check("strict schema compile", False, "glib-compile-schemas not found")

javascript_files = subprocess.check_output(
    ["git", "ls-files", "-z", "*.js"], cwd=ROOT
).decode().split("\0")
for filename in filter(None, javascript_files):
    source = (ROOT / filename).read_bytes()
    result = subprocess.run(
        ["node", "--input-type=module", "--check"],
        input=source,
        capture_output=True,
    )
    check(f"JS syntax: {filename}", result.returncode == 0, result.stderr.decode().strip())

if failures:
    print(f"\n{len(failures)} check(s) failed")
    sys.exit(1)

print("\nAll checks passed")
