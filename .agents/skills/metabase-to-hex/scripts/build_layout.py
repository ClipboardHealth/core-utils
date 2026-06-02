#!/usr/bin/env python3
"""
YAML round-trip helper for a Hex project: adds Input cells, Markdown cells,
and an appLayout with per-tab input bars matching the Metabase parameter mappings.

This is a TEMPLATE — copy and customize the constants at the top for each migration.

Workflow:
  hex project export <project_id> -o exported.yaml
  python3 build_layout.py            # writes import_ready.yaml
  hex project import import_ready.yaml

Inputs:
  exported.yaml                      — fresh Hex export with SQL cells already created
  dashboard_<id>.json                — Metabase dashboard JSON (for layout order + text cards)
"""
import json
import os
import sys
import time
import uuid
from pathlib import Path

import yaml

# ---------- CONFIGURE PER MIGRATION ----------

WORKDIR = Path("/home/alex/pii-migrations/dashboard_<ID>")
INPUT_YAML = WORKDIR / "artifacts/exported.yaml"
OUTPUT_YAML = WORKDIR / "artifacts/import_ready.yaml"
DASHBOARD_JSON = WORKDIR / "dashboard_<ID>.json"

# One entry per Metabase tab — order here is the order in the Hex App view
TABS = [
    # {"mb_tab_id": 91,  "name": "Main"},
    # ...
]

# For each tab, the input slugs that tab's cards use (mirrors Metabase
# parameter_mappings). Tab inputs render side-by-side in the first row of that tab.
TAB_INPUTS = {
    # 91: ["shift_id", "hcp_id", "facility_id"],
    # ...
}

# card_id -> exact cellLabel as already created via `hex cell create -l <label>`
CARD_LABEL = {
    # 22130: "App Shiftlogs Stg",
    # ...
}

# Inputs to create. The `name` is the Jinja variable; `label` is the UI label.
INPUTS = [
    # {"name": "shift_id",    "label": "Shift ID",    "default": ""},
    # ...
]

# ---------- END CONFIGURE ----------


def uuidv7() -> str:
    """Generate a UUID v7 — timestamp-prefixed, matches what Hex's export uses."""
    ts_ms = int(time.time() * 1000)
    rand = os.urandom(10)
    b = bytearray(16)
    b[0] = (ts_ms >> 40) & 0xFF
    b[1] = (ts_ms >> 32) & 0xFF
    b[2] = (ts_ms >> 24) & 0xFF
    b[3] = (ts_ms >> 16) & 0xFF
    b[4] = (ts_ms >> 8) & 0xFF
    b[5] = ts_ms & 0xFF
    b[6] = (0x70 | (rand[0] & 0x0F)) & 0xFF  # version 7
    b[7] = rand[1]
    b[8] = (0x80 | (rand[2] & 0x3F)) & 0xFF  # RFC variant
    b[9:16] = rand[3:10]
    return str(uuid.UUID(bytes=bytes(b)))


def make_input_cell(input_def):
    cell_id = uuidv7()
    return cell_id, {
        "cellType": "INPUT",
        "cellId": cell_id,
        "cellLabel": input_def["label"],
        "config": {
            "inputType": "TEXT_INPUT",
            "name": input_def["name"],
            "outputType": "STRING",
            "options": None,            # REQUIRED — omitting it = "malformed" import
            "defaultValue": input_def.get("default", ""),
        },
    }


def make_markdown_cell(text):
    cell_id = uuidv7()
    return cell_id, {
        "cellType": "MARKDOWN",
        "cellId": cell_id,
        "config": {"source": text},
    }


def cell_element(cell_id, show_source=False, show_label=True):
    """Element shape for appLayout. Use exactly this — Hex's parser is picky."""
    return {
        "showSource": show_source,
        "hideOutput": False,
        "type": "CELL",
        "cellId": cell_id,
        "sharedFilterId": None,
        "height": None,
        "showLabel": show_label,
        "explorable": None,
    }


def main():
    with open(INPUT_YAML) as f:
        doc = yaml.safe_load(f)
    with open(DASHBOARD_JSON) as f:
        dashboard = json.load(f)

    # Existing SQL cells: build cellLabel -> cellId map
    label_to_id = {c["cellLabel"]: c["cellId"] for c in doc.get("cells", []) if c.get("cellLabel")}
    card_to_cell = {cid: label_to_id[lbl] for cid, lbl in CARD_LABEL.items() if lbl in label_to_id}
    missing = [cid for cid in CARD_LABEL if cid not in card_to_cell]
    if missing:
        print(f"WARN: no Hex cell found for cards: {missing}", file=sys.stderr)

    # Build dashcards by tab (with row/col positions) for ordering markdown vs SQL
    pid2slug = {p["id"]: p.get("slug") for p in dashboard.get("parameters", [])}
    dashcards_by_tab = {t["mb_tab_id"]: [] for t in TABS}
    for dc in dashboard.get("dashcards", []):
        tab_id = dc.get("dashboard_tab_id")
        if tab_id not in dashcards_by_tab:
            continue
        card = dc.get("card") or {}
        cid = card.get("id")
        dashcards_by_tab[tab_id].append({
            "kind": "query" if cid else "text",
            "card_id": cid,
            "row": dc.get("row") or 0,
            "col": dc.get("col") or 0,
            "text": (dc.get("visualization_settings") or {}).get("text", "") if not cid else None,
        })
    for tab_id in dashcards_by_tab:
        dashcards_by_tab[tab_id].sort(key=lambda d: (d["row"], d["col"]))

    # Create INPUT cells (one per slug in INPUTS)
    new_cells = []
    input_name_to_cellid = {}
    for inp in INPUTS:
        cid, cell = make_input_cell(inp)
        new_cells.append(cell)
        input_name_to_cellid[inp["name"]] = cid

    # Create MARKDOWN cells (one per text card)
    md_cells_by_tab = {t["mb_tab_id"]: [] for t in TABS}
    for tab_id, cards in dashcards_by_tab.items():
        for c in cards:
            if c["kind"] == "text":
                cid, cell = make_markdown_cell(c["text"])
                new_cells.append(cell)
                md_cells_by_tab[tab_id].append({"row": c["row"], "cell_id": cid})

    doc["cells"].extend(new_cells)

    # Build appLayout.tabs
    layout_tabs = []
    for tab_meta in TABS:
        mb_id = tab_meta["mb_tab_id"]
        rows = []

        # Top row: this tab's input cells side-by-side
        input_slugs = TAB_INPUTS.get(mb_id, [])
        if input_slugs:
            n = len(input_slugs)
            span = 120 // n
            cols = []
            for i, slug in enumerate(input_slugs):
                start = i * span
                end = start + span if i < n - 1 else 120
                cols.append({
                    "start": start, "end": end,
                    "elements": [cell_element(input_name_to_cellid[slug])],
                })
            rows.append({"columns": cols})

        # Body: markdown + SQL outputs in dashcard order, full-width
        body_items = []
        for c in dashcards_by_tab[mb_id]:
            if c["kind"] == "query" and c["card_id"] in card_to_cell:
                body_items.append((c["row"], card_to_cell[c["card_id"]]))
            elif c["kind"] == "text":
                md = next((m for m in md_cells_by_tab[mb_id] if m["row"] == c["row"]), None)
                if md:
                    body_items.append((c["row"], md["cell_id"]))
        body_items.sort(key=lambda x: x[0])
        for _, cid in body_items:
            rows.append({"columns": [{"start": 0, "end": 120,
                                      "elements": [cell_element(cid)]}]})

        layout_tabs.append({"name": tab_meta["name"], "rows": rows})

    doc["appLayout"]["tabs"] = layout_tabs
    doc["appLayout"]["fullWidth"] = True

    # CRITICAL: sort cells so INPUT comes before MARKDOWN before SQL.
    # Otherwise SQL cells produce "Undefined variable(s)" at run time.
    priority = {"INPUT": 0, "MARKDOWN": 1, "SQL": 2}
    doc["cells"].sort(key=lambda c: priority.get(c.get("cellType"), 3))

    with open(OUTPUT_YAML, "w") as f:
        # allow_unicode preserves em-dashes; width=4096 prevents line wrapping.
        # Hex's YAML parser breaks on both if these aren't set.
        yaml.safe_dump(doc, f, allow_unicode=True, width=4096, sort_keys=False)

    print(f"Wrote {OUTPUT_YAML}")
    print(f"  cells total: {len(doc['cells'])}")
    print(f"  layout tabs: {len(doc['appLayout']['tabs'])}")
    print(f"  cards mapped: {len(card_to_cell)}/{len(CARD_LABEL)}")


if __name__ == "__main__":
    main()
