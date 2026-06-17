#!/usr/bin/env python3
"""
Parse a saved Metabase dashboard JSON into a structured inventory.

Usage:
  python3 inventory.py <path/to/dashboard_<id>.json>

Prints:
  - Tab list (id, name, position)
  - Dashboard parameters (slug, name, type, default)
  - Per-card metadata (id, name, tab, viz type, query type, source table, parameter slugs)
  - Text/instruction cards with content preview

Also writes:
  - query_cards.json  — list of dicts, one per query card
  - text_cards.json   — list of dicts, one per text card
"""
import json
import sys
from pathlib import Path


def main(path_str):
    path = Path(path_str)
    with open(path) as f:
        d = json.load(f)

    out_dir = path.parent

    tabs = {t["id"]: t for t in d.get("tabs", [])}
    print("=== TABS ===")
    if tabs:
        for tid, t in sorted(tabs.items(), key=lambda x: x[1].get("position", 0)):
            print(f"  tab {tid}: {t['name']} (pos={t.get('position')})")
    else:
        print("  (single page — no tabs)")

    print("\n=== DASHBOARD PARAMETERS ===")
    pid2slug = {}
    for p in d.get("parameters", []):
        slug = p.get("slug")
        pid2slug[p["id"]] = slug
        print(f"  {slug}: name='{p.get('name')}' type={p.get('type')} default={p.get('default')}")

    print("\n=== CARDS ===")
    query_cards = []
    text_cards = []
    for dc in d.get("dashcards", []):
        card = dc.get("card") or {}
        cid = card.get("id")
        tab_id = dc.get("dashboard_tab_id")
        tab_name = tabs.get(tab_id, {}).get("name", "(no tabs)")
        param_slugs = [pid2slug.get(m.get("parameter_id"), m.get("parameter_id"))
                       for m in (dc.get("parameter_mappings") or [])]
        row, col = dc.get("row") or 0, dc.get("col") or 0
        size_x, size_y = dc.get("size_x"), dc.get("size_y")

        if not cid:
            text = (dc.get("visualization_settings") or {}).get("text", "")
            text_cards.append({
                "tab_id": tab_id, "tab_name": tab_name,
                "row": row, "col": col, "size_x": size_x, "size_y": size_y,
                "text": text,
            })
            continue

        dq = card.get("dataset_query", {}) or {}
        qtype = dq.get("type")
        native_sql = dq.get("native", {}).get("query") if qtype == "native" else None
        source_table = dq.get("query", {}).get("source-table") if qtype == "query" else None

        query_cards.append({
            "cid": cid,
            "name": card.get("name"),
            "tab_id": tab_id,
            "tab_name": tab_name,
            "display": card.get("display"),
            "qtype": qtype,
            "native_sql_len": len(native_sql) if native_sql else 0,
            "source_table_id": source_table,
            "param_slugs": param_slugs,
            "row": row, "col": col, "size_x": size_x, "size_y": size_y,
        })

    # Sort by tab then row/col
    tab_pos = {t["id"]: t.get("position", 0) for t in d.get("tabs", [])}
    query_cards.sort(key=lambda c: (tab_pos.get(c["tab_id"], 0), c["row"], c["col"]))
    text_cards.sort(key=lambda c: (tab_pos.get(c["tab_id"], 0), c["row"], c["col"]))

    for c in query_cards:
        kind = f"native(len={c['native_sql_len']})" if c["qtype"] == "native" else f"mbql(src_table={c['source_table_id']})"
        display = c["display"] or ""
        print(f"  {c['cid']:>6}  tab={c['tab_name']:40s}  {display:8s}  {kind:30s}  params={c['param_slugs']}  -- {c['name']}")
    for c in text_cards:
        snippet = c["text"].replace("\n", " ")[:80]
        print(f"  [TEXT]  tab={c['tab_name']:40s}  r={c['row']} c={c['col']}  -- {snippet}")

    # Summary
    print("\n=== SUMMARY ===")
    print(f"  {len(query_cards)} query cards, {len(text_cards)} text cards across {len(tabs) or 1} tab(s)")
    per_tab = {}
    for c in query_cards + text_cards:
        per_tab.setdefault(c["tab_name"], []).append(c)
    for name, cards in per_tab.items():
        q = sum(1 for c in cards if "cid" in c)
        t = len(cards) - q
        print(f"    {name:40s}  {q} query + {t} text")

    with open(out_dir / "query_cards.json", "w") as f:
        json.dump(query_cards, f, indent=2)
    with open(out_dir / "text_cards.json", "w") as f:
        json.dump(text_cards, f, indent=2)
    print(f"\nWrote {out_dir/'query_cards.json'} and {out_dir/'text_cards.json'}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    main(sys.argv[1])
