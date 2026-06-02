---
name: metabase-to-hex
description: >
  Migrate a Metabase dashboard or single card/question to a Hex app at Clipboard Health — extract
  the source structure via the Metabase MCP, rewrite SQL onto core dbt models, scaffold the Hex
  project with the CLI, and finish the Input cells / markdown / appLayout via a YAML round-trip.
  Use this whenever the user asks to migrate, port, rebuild, or recreate a Metabase dashboard or
  card in Hex, asks to make a Hex version of a Metabase question, mentions a Metabase dashboard
  or `/question/` URL alongside Hex, wants to recreate Metabase parameter filtering as Hex Input
  cells, or wants to generalize multiple migrated cards into one parametrized app. Also use when
  the user references a previous migration ("like the WOPs Tool one", "same pattern as the
  Payments Dashboard") and wants the playbook applied to a new dashboard or card.
allowed-tools: Bash, Read, Edit, Write
---

# Metabase → Hex Migration Playbook

Migrate a Metabase dashboard to a Hex app following the pattern that worked for the WOPs Tool dashboard (1898 → Hex `019e08cb-79c0-7000-84c7-003f187d2669`). The Payments Team dashboard (1242 → Hex `019e275f-50bf-7000-8043-ad906145f55c`) is a partial reference — its Logic view is solid but its App view is blank because the bootstrap step (6b) was skipped. The three hardest parts are programmatically building the App view (which requires a one-time manual UI step — see Phase 6b), avoiding silent Jinja failures from undefined variables, and reusing rewritten SQL across migrations without column drift.

Most of this skill is about working around quirks of the Hex CLI and YAML import path. Read the relevant references when you hit each phase.

## Phases

1. **Inventory** — pull the source dashboard, save the JSON, parse tabs/parameters/cards
2. **SQL extraction** — for MBQL cards, compile to SQL via `execute_card`
3. **SQL rewrites** — prefer `DBT_PRODUCTION_CORE` core models over legacy `APP_*_STG` staging
4. **Project scaffold** — `hex project create`, capture the projectId
5. **SQL cells** — `hex cell create` for each query card
6a. **YAML round-trip — Inputs & Markdown** — add INPUT / MARKDOWN cells via `hex project import` (still works for adding cells; layout import alone won't make them appear in the App view)
6b. **App canvas bootstrap (manual UI step, required)** — ask the user to open the Hex App builder and drag any one cell onto the canvas. Without this, every subsequent `appLayout` import is silently ignored and the App view stays blank. See gotcha 9.
6c. **YAML round-trip — appLayout** — only after 6b, export, build the real `appLayout`, re-import. Hex now treats the import as an *update* to an initialized canvas and applies it.
7. **Verify** — `hex project run`, then UI review (CLI does not surface per-cell errors)

Work in a dedicated directory like `/home/alex/pii-migrations/dashboard_<id>/` with subfolders `queries/`, `hex_cells/`, `artifacts/`. Save intermediate JSON/YAML so you can resume after errors.

## Phase 1 — Inventory the source dashboard

Pull the dashboard. Save the raw response to a working file because the JSON is large (~500KB for a 20-tab dashboard) — don't try to keep it in conversation context.

```python
# Call mcp__metabase-cognitionai__get_dashboard with dashboard_id=<n>.
# The MCP saves the full response to a file when it exceeds the context budget.
# Copy that file into your working dir as dashboard_<id>.json.
```

If `metabase-cognitionai` returns 401 across the board, the credential is having one of its periodic refresh hiccups — wait a few minutes or use `metabase-server` as fallback.

Then parse:

```python
import json
with open('dashboard_1242.json') as f:
    d = json.load(f)

tabs = {t['id']: t['name'] for t in d.get('tabs', [])}
# parameters[]: slug, name, type, default
# dashcards[]: card.id, card.name, card.display, dashboard_tab_id,
#              card.dataset_query.type ('native' or 'query'),
#              parameter_mappings[].parameter_id  (map to parameters[].slug)
```

For each dashcard, you want: `card.id`, `card.name`, `tab_id`, `display`, query type, table refs, parameter slugs. Also collect text cards (the ones without `card.id`) — those have markdown in `visualization_settings.text`.

Use `scripts/inventory.py` as a starting point — it walks the JSON and prints the structured per-tab card list.

## Phase 2 — Extract SQL for MBQL cards

Native cards have `dataset_query.native.query` directly. MBQL cards don't — you need the compiled SQL from `execute_card`.

```python
# mcp__metabase-server__execute_card with card_id=<n>.
# Read data.native_form.query from the response.
```

**Schema bug:** the `parameters` field is typed as an object in the MCP schema but the server insists on a list. If the MCP UI requires a value, pass `[]`. Otherwise omit. Calling with `{}` returns "Assert failed: (u/maybe? sequential? parameters)".

Save each as `queries/<card_id>_<slug>.sql` for reference.

## Phase 3 — Rewrite SQL onto core dbt models

The Metabase native_form points at the table the original card was built on — frequently the legacy `DBT_PRODUCTION.APP_*_STG` tables. Rewrite these to prefer:

| Legacy / staging | Replacement |
|---|---|
| `APP_EXCLUSIONS_STG` | `DBT_PRODUCTION_CORE.FCT_EXCLUSIONS` |
| `APP_AGENTPROFILES_STG`, `APP_PII_AGENTPROFILES_STG` | `DBT_PRODUCTION_CORE.DIM_WORKERS` |
| `STG_APP__FACILITY_PROFILES`, facility lookups | `DBT_PRODUCTION_CORE.DIM_WORKPLACES` |
| `APP_SHIFTLOGS_STG` / shift state changes | `DBT_PRODUCTION_CORE.FCT_SHIFT_LOGS` |
| `APP_SHIFTGEOFENCEEVENTS_STG` (arrival/exit) | `DBT_PRODUCTION_CORE.FCT_SHIFTS` (`ARRIVED_FACILITY_GEOFENCE_AT`, `LEFT_FACILITY_GEOFENCE_AT`, `CLOCK_OUT_AT`) |
| `APP_FACILITYCANCELLEDMEREQUESTS_STG` | `DBT_PRODUCTION.STG_APP__FACILITY_CANCELLED_ME_REQUESTS` (column renames: `DELETED→IS_DELETED`, `AT_FACILITY→IS_AT_FACILITY`, `ID→FACILITY_CANCELLED_ME_REQUEST_ID`; no `FACILITY_ID`) |
| `APP_BONUSESPAYMENTS_STG` | `DBT_PRODUCTION.STG_APP__BONUSES_PAYMENTS` (preserves `AGENT_ID`, `REASON`, `SHIFT_ID`) |

When there's no core fact/dim, fall back to the newer `DBT_PRODUCTION.STG_APP__*` staging models — not the legacy `APP_*_STG` ones.

Before pushing, **verify column existence in Snowflake** via `INFORMATION_SCHEMA.COLUMNS` — the Metabase MCP doesn't surface dbt column changes, so guessed columns will break silently. See `references/cbh_stack.md` for the schemas list and connection IDs.

**Reuse SQL across migrations.** If a previous migration (e.g. WOPs Tool at `/home/alex/wops_migration/hex_cells_v3/`) already has a rewritten version of the same card, copy it — but audit its Jinja variables against the new project's inputs before reusing (see gotcha 1 below).

## Phase 4 — Scaffold the Hex project

```bash
hex project create "<title>" -d "<description>" --json
```

Capture the returned `id` (the projectId). Save it to `artifacts/project.env` for the rest of the run.

Hex workspace: `e673b166-274e-4db9-972d-badc91dbfe1b`. Dev Snowflake connection: `Snowflake (Small Warehouse)` (id `f5606b78-4aba-4d11-9820-8712a8c765b2`). The PII service account silently returns empty when run as alex — only use it at publish time, never for draft work. See `references/cbh_stack.md`.

## Phase 5 — Create SQL cells

Loop over your rewritten `.sql` files and call `hex cell create` for each:

```bash
hex cell create "$PROJECT_ID" \
  -t sql \
  -s "$(cat path/to/card.sql)" \
  -l "Card label exactly as it should appear" \
  --data-connection-id "f5606b78-4aba-4d11-9820-8712a8c765b2" \
  --output-dataframe "snake_case_slug" \
  --json
```

A working bash loop with label and dataframe maps is in `scripts/create_cells.sh.tmpl` — adapt it per dashboard.

`hex cell update` requires `-t <type>` even when only changing the connection. There is **no `--label` flag** — to rename, use the cellId swap in Phase 6. To delete a scratch/debug cell, use `hex cell delete <dynamic-id>`.

## Phase 6 — YAML round-trip (Inputs, Markdown, appLayout)

The Hex CLI cannot create INPUT cells, place cells in the App view, or order tabs. Two parts of this must go through YAML import, and **one part requires a manual UI step before YAML import will work**. Don't skip 6b — it's the failure mode that ate ~45 minutes on the dashboard 2769 migration.

### Phase 6a — Inputs & Markdown via YAML

```bash
hex project export "$PROJECT_ID" -o exported.yaml
# ...edit YAML in python: add INPUT cells, MARKDOWN cells...
hex project import import_ready.yaml
```

A complete builder script template is at `scripts/build_layout.py`. The high-level shape:

1. Load the YAML with `yaml.safe_load`.
2. Build a `cellLabel → cellId` map from the existing SQL cells (so layout can reference them).
3. Append new cells to `doc['cells']`:
   - **N INPUT cells** — one per dashboard parameter. Schema must be exact (see `references/yaml_schemas.md`).
   - **N MARKDOWN cells** — one per text/instruction card from the Metabase dashboard.
4. **Sort `doc['cells']` so `INPUT` cells come first, then `MARKDOWN`, then `SQL`.** This is critical for Jinja resolution — see gotcha 2.
5. `yaml.safe_dump(..., allow_unicode=True, width=4096, sort_keys=False)`. Don't change `meta.projectId` or `meta.sourceVersionId`.
6. Import. Re-list cells if you need their new IDs — they change on every import.

At this point the Logic view should be fully populated. The App view will still be blank. That's expected — proceed to 6b.

**Dropdown backed by a SQL cell.** When the Metabase parameter was a "values from a query" parameter (or you just want the Hex equivalent), the Hex INPUT shape is a single-select `DROPDOWN` whose options reference another SQL cell's output dataframe by name:

```yaml
- cellType: INPUT
  cellId: <uuidv7>
  cellLabel: MSA list
  config:
    inputType: DROPDOWN
    name: msa_list
    outputType: DYNAMIC
    options:
      valueOptions: { dfName: msa_options, variableName: null }
      optional: false
    defaultValue: null
```

Create the options SQL cell first (it must produce a dataframe whose first column becomes the dropdown values — e.g. `SELECT DISTINCT MSA FROM ... ORDER BY MSA`). Then add the INPUT cell pointing at it via `dfName: <that_cell's_resultVariableName>`. Run the project once after import so the options dataframe materializes — until it does, the dropdown is empty.

**Multi-select is not settable via YAML.** Hex's import API rejects every multi-select variant I've tried (`MULTI_SELECT`, `MULTI_SELECT_INPUT`, `DROPDOWN + multiSelect: true`, `DROPDOWN + multipleSelect: true`) with the generic "malformed" error. The working pattern is: push this exact single-select `DROPDOWN` shape, then ask the user to flip the multi-select toggle in the cell's right-sidebar config. The SQL is forward-compatible if you use `WHERE col IN ({{ var | array }})` — see gotcha 10. The `| array` filter is a no-op for single-select, so the SQL doesn't need to change when the toggle flips.

**Date and date-range inputs follow the same UI-flip pattern.** YAML import also rejects every date variant (`DATE_PICKER`, `DATE_INPUT`, `DATE`, `DATE_RANGE`, `DATE_RANGE_PICKER`, `DATERANGE`). Push a `TEXT_INPUT` placeholder with the snake_case `name` the SQL will reference, then ask the user to open the cell and change **Input type** to `Date` (and toggle **Allow date range** for ranges). For a *date-range* input, Hex doesn't bind the cell's `name` — it injects two separate variables suffixed `_start` and `_end` (both `datetime.date`). Reference them as `{{ <name>_start }}` and `{{ <name>_end }}`. Referencing the base `name` (or `.start`/`.end`/`[0]`/`[1]` on it) fails with `Undefined variable(s): <name>` because the base is literally not in scope. See gotcha 18 for the diagnostic-cell recipe that took 2 minutes to confirm vs. an hour of guessing. Plain `TEXT_INPUT` + `CAST({{ var }} AS TIMESTAMP_NTZ)` still works if the user doesn't need a calendar UX.

### Phase 6b — App canvas bootstrap (manual, user must do this)

**This step is required for any project that has never had its App view manually touched.** `hex project import` will not create an App canvas from scratch — it can only update one that already exists.

Stop and tell the user:

> Open `https://app.hex.tech/<workspace>/hex/<project-id>/draft/logic?view=app` in your browser. Drag any one cell from the cell tray on the left onto the canvas. This initializes Hex's draft-app state. Let me know when you've done that and I'll import the rest of the layout.

Do not proceed to 6c until the user confirms. The cell they drag can be any cell; it doesn't need to land in its final position — you'll overwrite the canvas with the real layout in 6c.

**How to recognize you're hitting this gotcha:** if you've imported a YAML with a structurally valid `appLayout` (verified by re-exporting and checking the cellIds resolve), `hex project run` completes successfully, the Logic view shows all cells, but `?view=app` is blank — it's almost always missing the 6b bootstrap. See gotcha 9.

### Phase 6c — appLayout via YAML round-trip

Only after 6b is done:

```bash
hex project export "$PROJECT_ID" -o exported.yaml
# ...edit YAML in python: build appLayout.tabs[].rows...
hex project import import_ready.yaml
```

Build `doc['appLayout']['tabs']` — one tab per Metabase tab, with:
- **Top row**: only the Input cells *this tab's cards use* (mirrors Metabase's per-tab parameter mapping). Side-by-side: columns span 0-120 evenly.
- **Body rows**: markdown + SQL output cells in dashcard `(row, col)` order, full-width (`start: 0, end: 120`).

Include `visibleMetadataFields` and `fullWidth: true` at the top of `appLayout` (Hex's export emits these — keep them):

```yaml
appLayout:
  visibleMetadataFields: [NAME, DESCRIPTION, AUTHOR, LAST_EDITED, LAST_RUN, CATEGORIES, STATUS, TABLE_OF_CONTENTS]
  fullWidth: true
  tabs:
    - name: Overview
      rows: [...]
```

Tell the user to hard-refresh the App tab after the import — Hex's UI caches the prior draft-app state.

## Phase 7 — Verify

```bash
hex project run "$PROJECT_ID" --json
```

The CLI does **not** surface per-cell errors. You must open the project in the browser to see which cells errored. The URL is in the run response. Common failure: "Undefined variable(s): X" — see gotchas 1 and 2.

If a few cells need surgical fixes, edit the local `.sql`, then push individual cells with `hex cell update <dynamic-id> -t sql -s "$(cat path/to/card.sql)"`. Get the current dynamic ids from `hex cell list --json`; for larger projects (or as ground truth) prefer `hex project export` since `hex cell list` is paginated. The `cellId` in the export is the *staticId*, not the dynamic id — see gotcha 6.

Also run the SQL manually in Snowflake with substituted variable values for at least one card per tab — `mcp__snowflake-mcp__sql_exec_tool` works for this. Validates the rewrite before the user discovers it in the UI.

## Critical gotchas (read before you start)

These are the failure modes that will eat the most time if you don't internalize them.

### 1. Every Jinja variable in SQL must exist as a project Input

Hex Jinja errors with `Undefined variable(s): X` if `{% if X %}` or `{{ X }}` references a variable that isn't defined by an Input cell in the project. This bites hard when you copy SQL from another Hex project — the variable names from the old project (e.g., `worker_id`, `workplace_id`, `msa`) leak in.

**Audit before importing:**

```bash
for f in hex_cells/*.sql; do
  vars=$(grep -oE '\{[%{][- ]*(if +[a-z_]+|[a-z_]+) [- ]*[%}]\}' "$f" \
         | grep -oE '[a-z_]+' \
         | grep -v -E '^(if|else|elif|endif|endfor|for|in)$' \
         | sort -u | tr '\n' ',' | sed 's/,$//')
  echo "$(basename $f): $vars"
done
```

Cross-reference against your project's Input cell `config.name` values. Rename or drop any that don't match. Empty input values are fine — Hex substitutes `NULL` for `{{ var }}` when the input is empty.

### 2. Cell order: INPUT must come before SQL in `doc['cells']`

Even with correct `config.name`, INPUT cells placed below SQL cells in the notebook produce `Undefined variable(s)` errors at run time — Hex resolves Jinja top-to-bottom. After all your YAML edits, stable-sort by type:

```python
priority = {'INPUT': 0, 'MARKDOWN': 1, 'SQL': 2}
doc['cells'].sort(key=lambda c: priority.get(c.get('cellType'), 3))
```

The WOPs Tool project keeps inputs at the very top, sometimes wrapped in a `COLLAPSIBLE`. The simple sort above is sufficient.

### 3. Hex SQL Jinja — never quote `{{ var }}`

Hex auto-wraps string inputs in single quotes during substitution. Writing `WHERE col = '{{ shift_id }}'` confuses the parser and emits a Snowflake `?` placeholder (string literal) — the query runs but matches nothing, silently. Always write `WHERE col = {{ shift_id }}`.

For Metabase optional clauses `[[AND col = {{var}}]]`, translate to `{% if var %}AND col = {{ var }}{% endif %}` — again, no quotes around `{{ var }}`.

### 4. INPUT cell YAML schema — `options: null` is required

```yaml
- cellType: INPUT
  cellId: <uuidv7>
  cellLabel: Shift ID
  config:
    inputType: TEXT_INPUT
    name: shift_id
    outputType: STRING
    options: null         # required — omitting it makes import fail with generic "malformed"
    defaultValue: ''
```

Do **not** add a `label:` key inside `config` — only `cellLabel` at the cell level. The full cell shape reference is in `references/yaml_schemas.md`.

### 5. `cellLabel` is immutable on YAML import — rename via cellId swap

Changing a `cellLabel` in the YAML and re-importing is silently ignored, even if you also modify the cell's `source`. The CLI has no `--label` flag either. To actually rename:

```python
# in your YAML editor script
old_id = c['cellId']
new_id = uuidv7()                       # fresh UUID
c['cellId'] = new_id
c['cellLabel'] = new_label
# remove the cell with old_id from doc['cells'] (or skip it during rebuild)
# rewrite every appLayout element that referenced old_id:
for tab in doc['appLayout']['tabs']:
    for row in tab.get('rows', []):
        for col in row.get('columns', []):
            for el in col.get('elements', []):
                if el.get('cellId') == old_id:
                    el['cellId'] = new_id
```

Then import once. Hex sees the old cellId vanish (deletes it) and the new cellId appear (creates it with the new label). A complete script is at `scripts/rename_cells.py`.

### 6. `hex cell update` wants the dynamic id from `hex cell list`, not the staticId

Hex tracks every cell with two IDs that are easy to mix up:

- **`staticId`** — the canonical ID. Returned in the `staticId` field of `hex cell create`'s JSON response, and shown as `cellId:` in `hex project export`. Stable across imports.
- **`id`** (the dynamic id) — the per-version handle. Returned in the `id` field of `hex cell create` and listed by `hex cell list`. **Changes on every YAML import.**

`hex cell update <id>` only accepts the dynamic `id`. Passing the `staticId` (or any stale dynamic id from before the last import) returns a misleading `Forbidden` — it's effectively a 404. The fix is always: run `hex cell list <project-id> --json` to fetch fresh dynamic ids, then update.

Anything you cached from `hex cell create` *before* a YAML import is also dead — the create call's dynamic `id` was invalidated by the subsequent import. Re-list, then update.

### 7. Don't change `meta.projectId` or `meta.sourceVersionId`

These are how Hex matches the import to the existing project. If you change them, Hex creates a new project (or refuses). Leave them alone.

### 9. App view stays blank after YAML import — needs UI bootstrap

**Symptom:** You imported a YAML with a well-formed `appLayout` (all cellIds resolve, structurally matches working dashboards). `hex project run` completes successfully. Logic view shows all cells. But `?view=app` is blank — no inputs, no charts, no markdown.

**Cause:** `hex project import` can only *update* an existing App canvas — it can't bootstrap one from scratch. If no human has ever dragged a cell onto the canvas in this project, every `appLayout` import is silently ignored. The Payments Team dashboard demonstrates this: the YAML has a valid `appLayout`, the import succeeds, but the App view is permanently blank.

**Confirmed by experiment** (dashboard 2769 migration, 2026-05-15):
1. Cloned the WOPs Tool YAML into a brand new Hex project — App view blank.
2. Cloned the Payments YAML into a brand new project — App view blank.
3. Original Payments project — App view *also* blank (never bootstrapped).
4. Only the WOPs Tool's original project renders, because its canvas was first built by hand and the YAML round-trip only *added* SQL cells to the existing layout.

**Fix:** Stop after the cells are imported. Tell the user to open the App builder (`?view=app`) and drag any single cell onto the canvas. After they confirm, re-export, build the real `appLayout`, and re-import. See Phase 6b.

### 8. `yaml.safe_dump` — `allow_unicode=True, width=4096`

Em-dashes and other unicode in SQL comments / markdown / SOP text get escaped without `allow_unicode=True`, which Hex's parser then rejects. Without `width=4096`, long SQL lines wrap, which also breaks the parser. Use both flags every time:

```python
yaml.safe_dump(doc, f, allow_unicode=True, width=4096, sort_keys=False)
```

### 10. `| array` Jinja filter required for multi-select inputs in SQL

**Symptom:** A SQL cell that references a multi-select dropdown's variable errors at run time with:

```
MissingArrayFilterError: Got a list, tuple, or set.
Did you forget to apply '| array' to your query?
For example: `{{ list_of_values | array }}`
```

**Cause:** Hex auto-quotes scalar string inputs but refuses to silently choose a serialization for lists — multi-select outputs are lists, and the developer must opt in to the `array` filter, which expands the list to comma-separated quoted scalars (`'A', 'B', 'C'`).

**Fix:** Use the filter inside an `IN (...)` clause:

```sql
WHERE w.MSA IN ({{ msa_list | array }})
```

This is the same `{{ var }}` slot that gotcha 3 says *not* to quote — the parens belong to the SQL (`IN (...)`), not around the Jinja. The `| array` filter is a no-op for single-select scalars, so the SQL stays forward-compatible if the input later gets toggled between single- and multi-select.

**Edge — empty selection:** `{% if msa_list %}…{% else %}AND 1=0{% endif %}` still works — Jinja treats both `None` and an empty list `[]` as falsy.

**Confirmed by experiment** on the generalized supply drilldown (`019e64b0-a730-7000-807c-5debd510361e`) on 2026-05-26.

## Layout shape cheatsheet

```yaml
appLayout:
  fullWidth: true
  tabs:
    - name: Main
      rows:
        # Inputs side-by-side at top
        - columns:
            - {start: 0,  end: 40,  elements: [<cell-element>]}   # shift_id input
            - {start: 40, end: 80,  elements: [<cell-element>]}   # hcp_id input
            - {start: 80, end: 120, elements: [<cell-element>]}   # facility_id input
        # Full-width body row
        - columns:
            - {start: 0, end: 120, elements: [<cell-element>]}
```

Cell element shape (use exactly this):

```python
{
  "showSource": False, "hideOutput": False, "type": "CELL",
  "cellId": "<id>", "sharedFilterId": None, "height": None,
  "showLabel": True, "explorable": None,
}
```

Columns span 0–120. Common splits: full width (0–120), halves (0–60, 60–120), thirds (0–40, 40–80, 80–120).

## Per-tab Inputs (the why)

Each Hex tab should expose **only** the Input cells used by SQL cells on that tab. This mirrors Metabase's per-tab parameter mapping and keeps the UI tight — agents don't get a global filter bar with 11 inputs when the tab only uses 1.

In your YAML editor, build `TAB_INPUTS` from each Metabase tab's `dashcards[].parameter_mappings[]`. Don't hardcode a global input set.

## Workflow variants

The playbook above assumes a multi-tab dashboard. Two adjacent workflows reuse most of the same pieces but compress or extend specific phases.

### Single-card migrations (one Metabase question → one Hex app)

When the user points at a Metabase *question/card* URL (`/question/<id>-...`) instead of a *dashboard* URL:

- **Phase 1** collapses to one `mcp__metabase-cognitionai__get_card` call. No tabs to enumerate.
- **Phase 2** is trivial when `query_type` is `"native"` — read `dataset_query.stages[0].native` directly. Still call `execute_card` for MBQL cards.
- **Phase 6a** often has no INPUT cells (single cards usually have `parameters: []`). Just a markdown header + the SQL cell.
- **Phase 6b** (canvas bootstrap) is still required — every brand-new project hits it.
- **Phase 6c** layout: one tab, two rows (markdown, then SQL), both full-width.

Reference migrations (2026-05-26): card `90900` (LA Supply Drill-down) → Hex `019e6479-9c45-7000-8f53-c658658aadc9`; card `91302` (Chicago Supply Drill-down) → Hex `019e6495-6075-7000-84bd-8e0c7812bad7`.

### Generalizing from multiple cards into one parametrized app

When two or more migrated cards share structure differing only by hardcoded filters (an MSA, a state, a role), promote the filter(s) to INPUT cells and build one app:

- Use the **dynamic-dropdown pattern** from Phase 6a (SQL options cell + `DROPDOWN` input + user flips multi-select toggle) so the filter feels native rather than asking users to paste delimited text.
- SQL references the filter via `WHERE col IN ({{ var | array }})` (gotcha 10).
- Prefer **per-worker (or per-row) scoping over per-card scoping** when the original cards baked the filter into the joined set. Example: the LA card and Chicago card both hardcoded a "required reqs" set at the MSA level; the generalized version joins each worker against the reqs that apply to *their own* state (`DIM_WORKERS.STATE`). More accurate (a Wisconsin-side Chicago worker isn't held to IL-specific reqs) but counts will differ from the source cards — call this out in the markdown header so consumers don't think the generalized app is broken.
- Often you'll want a **summary table** (1 row per entity) plus a **detail table** (long-format, 1 row per entity × dimension). The detail is what makes per-row scoping inspectable.

Reference: project `019e64b0-a730-7000-807c-5debd510361e` (generalized supply drilldown from cards 90900 + 91302, 2026-05-26).

## Reference files

For deep dives — read these only when you hit the relevant phase or gotcha:

- `references/gotchas.md` — extended gotcha catalog with the incident that produced each one
- `references/yaml_schemas.md` — exact cell shapes (INPUT, SQL, MARKDOWN), appLayout, and the meta block
- `references/cbh_stack.md` — Clipboard Health Snowflake schemas, Hex workspace/connection IDs, table-swap cheatsheet

## External memory pointers

If you need richer context (or this skill is being used by an agent without conversation history), these memory files capture the migrations this skill is distilled from:

- `/home/alex/.claude/projects/-home-alex/memory/feedback_hex_app_layout.md` — YAML round-trip pattern and gotchas
- `/home/alex/.claude/projects/-home-alex/memory/reference_data_stack.md` — Hex/Metabase/Snowflake host info and MCP gotchas
- `/home/alex/.claude/projects/-home-alex/memory/project_wops_tool.md` — WOPs Tool migration log (dashboard 1898)
- `/home/alex/.claude/projects/-home-alex/memory/project_payments_dashboard.md` — Payments Team migration log (dashboard 1242)
- `/home/alex/.claude/projects/-home-alex-pii-migrations/memory/feedback_hex_app_layout_via_yaml.md` — App canvas bootstrap requirement (dashboard 2769 incident, 2026-05-15)
