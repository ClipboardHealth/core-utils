#!/usr/bin/env python3
"""
Rename Hex cells via the cellId-swap pattern.

`cellLabel` is treated as immutable by Hex's YAML import — changing it in-place is
silently ignored. The workaround: assign each renamed cell a fresh UUID v7, drop the
old cellId entry, and rewrite every appLayout reference to point at the new ID.

Usage:
  1. hex project export <project_id> -o exported.yaml
  2. Edit the RENAMES dict below.
  3. python3 rename_cells.py exported.yaml renamed.yaml
  4. hex project import renamed.yaml
"""
import os
import sys
import time
import uuid

import yaml


RENAMES = {
    # "Old Cell Label": "New Cell Label",
}


def uuidv7():
    ts_ms = int(time.time() * 1000)
    rand = os.urandom(10)
    b = bytearray(16)
    b[0] = (ts_ms >> 40) & 0xFF
    b[1] = (ts_ms >> 32) & 0xFF
    b[2] = (ts_ms >> 24) & 0xFF
    b[3] = (ts_ms >> 16) & 0xFF
    b[4] = (ts_ms >> 8) & 0xFF
    b[5] = ts_ms & 0xFF
    b[6] = (0x70 | (rand[0] & 0x0F)) & 0xFF
    b[7] = rand[1]
    b[8] = (0x80 | (rand[2] & 0x3F)) & 0xFF
    b[9:16] = rand[3:10]
    return str(uuid.UUID(bytes=bytes(b)))


def main(in_path, out_path):
    with open(in_path) as f:
        doc = yaml.safe_load(f)

    id_swap = {}            # old_id -> new_id
    new_cells = []

    # First pass: emit non-renamed cells as-is. Renamed cells get appended at the end
    # with the new cellId + cellLabel.
    for c in doc["cells"]:
        if c.get("cellLabel") in RENAMES:
            old_id = c["cellId"]
            new_id = uuidv7()
            id_swap[old_id] = new_id
            renamed = dict(c)
            renamed["cellId"] = new_id
            renamed["cellLabel"] = RENAMES[c["cellLabel"]]
            new_cells.append(renamed)
            print(f"  {c['cellLabel']}  →  {RENAMES[c['cellLabel']]} (cellId {old_id} → {new_id})")
        else:
            new_cells.append(c)

    doc["cells"] = new_cells

    # Rewrite every appLayout element that referenced an old cellId
    for tab in doc.get("appLayout", {}).get("tabs", []):
        for row in tab.get("rows", []):
            for col in row.get("columns", []):
                for el in col.get("elements", []):
                    if el.get("cellId") in id_swap:
                        el["cellId"] = id_swap[el["cellId"]]

    with open(out_path, "w") as f:
        yaml.safe_dump(doc, f, allow_unicode=True, width=4096, sort_keys=False)

    print(f"\nWrote {out_path}.  Renamed {len(id_swap)} cells.")
    print("Run: hex project import " + out_path)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: rename_cells.py <in.yaml> <out.yaml>")
        sys.exit(1)
    main(sys.argv[1], sys.argv[2])
