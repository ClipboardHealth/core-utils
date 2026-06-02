# Hex / Metabase migration gotchas — extended catalog

Each entry: the symptom, the cause, the fix, and (where useful) the incident it
came from. SKILL.md has short versions of the most critical ones — this file is
the long-form reference.

## 1. "Undefined variable(s): X" at SQL cell run time

**Symptom:** A SQL cell errors with `Undefined variable(s): facility_id` (or
similar) when the project is run, even though an INPUT cell with that exact
`config.name` exists in the same project.

**Cause:** Hex's Jinja resolution walks the notebook top-to-bottom. If an INPUT
cell is placed AFTER the SQL cell in the `cells:` list, the variable is not yet
in scope when the SQL cell renders.

**Fix:** Stable-sort `doc['cells']` before importing so INPUT cells come first,
then MARKDOWN, then SQL:

```python
priority = {"INPUT": 0, "MARKDOWN": 1, "SQL": 2}
doc["cells"].sort(key=lambda c: priority.get(c.get("cellType"), 3))
```

**Incident:** Dashboard 1242 migration (2026-05-14). After all SQL cells were
created and inputs were added at the bottom of the YAML, every SQL cell reported
"Undefined variable(s)". Re-ordering fixed it without changing any cell content.

## 2. Jinja variable from another project leaks in

**Symptom:** Same as gotcha 1 (`Undefined variable(s): worker_id`), but you've
already confirmed cell order is correct.

**Cause:** SQL was copied from another Hex project whose inputs had different
names. The reused SQL still references the old names. Common offenders when
reusing from the WOPs Tool project: `worker_id`, `workplace_id`, `workplace_name`,
`msa`, `parent_name`, `referrer_id`, `referred_id`, `message_type`.

**Fix:** Audit before importing:

```bash
bash scripts/audit_vars.sh hex_cells/
```

Cross-check the output against the new project's Input `config.name` values.
Rename `worker_id → hcp_id`, `workplace_id → facility_id`, etc., as needed. Drop
filters for inputs that don't exist in the new project at all.

**Incident:** Dashboard 1242 migration — 13 of 20 SQL cells were copied from
WOPs Tool v3 SQL. 11 of them referenced `worker_id` / `workplace_id` / others
that don't exist in dashboard 1242's input set, which has just 5 params:
`shift_id, hcp_id, facility_id, referred_id, referrer_id`.

## 3. INPUT cell rejected as "malformed"

**Symptom:** `hex project import` fails with `A request to the Hex API was
rejected as malformed. Your input may be invalid, or your CLI version may be out
of date.` Generic, no row/column pointer.

**Cause:** Your INPUT cell `config:` block is missing the required `options: null`
key, or you added a `label:` key inside `config` that Hex doesn't accept.

**Fix:** Use exactly:

```yaml
- cellType: INPUT
  cellId: <uuid7>
  cellLabel: Shift ID
  config:
    inputType: TEXT_INPUT
    name: shift_id
    outputType: STRING
    options: null
    defaultValue: ""
```

**Bisect technique** (if you can't tell what's wrong): export a known-good YAML
(WOPs Tool: `019e08cb-79c0-7000-84c7-003f187d2669`), `grep -A 5 "cellType: INPUT"`,
and copy the exact shape.

## 4. `'{{ shift_id }}'` returns no rows (silent failure)

**Symptom:** A SQL cell runs without errors but returns 0 rows even when you know
the data exists. Inspecting Snowflake query history shows it ran with `?`
placeholder, not the actual value.

**Cause:** You wrapped the Jinja variable in manual single quotes. Hex's Jinja
substitutes string inputs as **already-quoted** values — manual quotes turn the
substitution into a Snowflake bind parameter literal `?`, which matches nothing.

**Fix:** Always write `WHERE col = {{ shift_id }}` (no quotes). Hex emits
`WHERE col = '66f5bfa6e01fd3697b175ebc'`.

For Metabase optional clauses `[[AND col = {{var}}]]`:

- Translate to `{% if var %}AND col = {{ var }}{% endif %}`
- NOT to `{% if var %}AND col = '{{ var }}'{% endif %}`

## 5. cellLabel rename silently ignored

**Symptom:** You change `cellLabel: Foo` to `cellLabel: Bar` in the YAML, import,
and the cell still shows "Foo" in the UI and on `hex cell list`.

**Cause:** Hex treats `cellLabel` as part of the cell's identity for import
purposes. Changing it in-place is ignored. Even adding a no-op change to `source`
doesn't help.

**Fix:** Use the cellId-swap pattern — assign a fresh UUID v7, drop the old
entry, and rewrite every appLayout reference. See `scripts/rename_cells.py`.

**Why this works:** From Hex's perspective, the old cellId no longer appears in
the imported `cells:` list, so it's deleted. The new cellId appears for the
first time, so it's created with the new label. The appLayout points at the new
ID, so the UI shows the renamed cell in the right spot.

## 6. `hex cell update` returns "Forbidden" on a cell that exists

**Symptom:** `hex cell update <cell-id> -t sql -s "..."` fails with `Forbidden`,
but the cell visibly exists in the project.

**Cause:** Hex tracks every cell with two IDs and the update endpoint accepts
only one of them:

- **`staticId`** — the canonical ID. Returned in the `staticId` field of
  `hex cell create`'s JSON response, and shown as `cellId:` in `hex project export`.
  Stable across imports. **NOT accepted by `hex cell update`.**
- **`id`** (the dynamic id) — the per-version handle. Returned in the `id` field
  of `hex cell create` and listed by `hex cell list`. Changes on every YAML
  import. **This is the one `hex cell update` requires.**

The `Forbidden` response when you pass a `staticId` (or a stale dynamic id from
before the last import) is misleading — it's effectively a 404.

**Fix:** Always `hex cell list <project-id> --json` immediately before updating
to fetch fresh dynamic ids. The dynamic id from a `hex cell create` call also
goes stale after any subsequent YAML import — re-list, then update.

**Incident:** Generalized supply drilldown migration (2026-05-26). After
creating SQL cells with `hex cell create` and capturing their `staticId`
values, a later YAML import (to add a markdown header and dropdown input)
invalidated the dynamic ids. Subsequent `hex cell update <staticId>` calls
returned `Forbidden`; switching to `hex cell list --json` ids worked
immediately.

## 7. `hex cell list` returns only ~25 cells

**Symptom:** A project has 39 cells but `hex cell list` only shows 20–25, with
some labels appearing twice.

**Cause:** Pagination. The CLI's `--json` output is a single page.

**Fix:** Use `hex project export <project-id> -o /tmp/x.yaml` and read `cells:`
from the YAML. That's the complete list.

## 8. Em-dash / unicode in SQL or markdown breaks import

**Symptom:** `hex project import` fails with a vague parse error after you edit
the YAML with a script.

**Cause:** Default `yaml.safe_dump` escapes non-ASCII as `—` etc., or wraps
long lines. Hex's YAML parser doesn't handle either well.

**Fix:** Always use:

```python
yaml.safe_dump(doc, f, allow_unicode=True, width=4096, sort_keys=False)
```

## 9. `metabase-server.execute_card` rejects the parameters argument

**Symptom:** Call to `mcp__metabase-server__execute_card` returns
`Assert failed: (u/maybe? sequential? parameters)`.

**Cause:** The MCP schema says `parameters` is an object, but the underlying
Metabase server expects a list. Sending `{}` triggers the assert.

**Fix:** Pass `[]` (an empty list) when the schema requires a value. If the MCP
client lets you omit it, omit it.

## 10. metabase-cognitionai returns 401 across all endpoints

**Symptom:** Every call to any `mcp__metabase-cognitionai__*` tool returns 401,
even though the connector UI says "connected."

**Cause:** Server-side credential refresh hiccup. Not user-fixable.

**Fix:** Wait a few minutes — it often self-resolves. As fallback, use
`mcp__metabase-server__*` (less rich, but works).

## 11. `metabase-server.get_dashboard_cards` Zod validation error

**Symptom:** Calling `mcp__metabase-server__get_dashboard_cards` returns a Zod
union validation failure on the first content block.

**Cause:** Known schema bug in the MCP for some dashboards.

**Fix:** Use `mcp__metabase-cognitionai__get_dashboard` instead, then parse the
`dashcards` field from the returned JSON yourself.

## 12. Empty SQL results when running cells as alex

**Symptom:** SQL cells run successfully but return zero rows even for queries
you've verified return data elsewhere.

**Cause:** The cell's `dataConnectionId` is the `Hex Apps: Snowflake PII Service
Account` connection (`019bb2d8-d867-7001-bb8a-ccb8b6d16e8a`). Workspace member
alex isn't in the gating group "Hex Apps: Snowflake App PII Service Account", so
they only get `VIEW_RESULTS` — running queries silently returns empty.

**Fix:** Use `snowflake analytics` (`530b70b8-b300-43c9-9b3e-e4b98ded0379`)
for draft work. Only switch to the PII service account at publish time, when the
app runs queries server-side as the service account.

## 13. CLI does not surface per-cell errors

**Symptom:** `hex project run <id>` returns a `RUNNING` or `SUCCEEDED` status,
but cells are visibly broken in the UI.

**Cause:** The CLI's run endpoint reports project-level status only. Per-cell
errors (Jinja undefined, SQL syntax, missing columns) are surfaced only in the
notebook UI.

**Fix:** After `hex project run`, open the project URL in the browser and click
through each tab. Or run the SQL manually in Snowflake (with substituted
variable values) before pushing to validate.

## 14. Guessed column names in copied SQL

**Symptom:** A SQL cell errors with `SQL compilation error: invalid identifier`.

**Cause:** SQL was reused from a previous migration where the column existed in
a different (often legacy) table. The column doesn't exist in the new core
model, e.g., `PSST_BALANCE_HOURS` or `PSST_DAYS_ACCRUED` on `FCT_SHIFTS`.

**Fix:** Always verify columns via `INFORMATION_SCHEMA.COLUMNS` before reusing
SQL across schemas:

```sql
SELECT COLUMN_NAME, DATA_TYPE
FROM ANALYTICS.INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'DBT_PRODUCTION_CORE'
  AND TABLE_NAME = '<new table>'
ORDER BY ORDINAL_POSITION;
```

When a column truly doesn't exist in core, either derive it from available
columns (e.g., `HOURS_LAST_90D` from `SUM(PAY_DURATION_IN_MINUTES) / 60.0` on
`FCT_SHIFTS`) or leave a `-- TODO` comment for the user.

## 15. App view stays blank after YAML import — needs UI bootstrap

**Symptom:** You imported a YAML with a well-formed `appLayout` block (cells
referenced, all cellIds resolve, structurally identical to a known-working
dashboard). `hex project run` completes successfully. The Logic view
(`/draft/logic`) shows all cells. But the App view (`?view=app` or `/draft/app`)
is completely blank — no inputs, no markdown, no charts, no error message, no
"Add cell" placeholder. Hard refresh, incognito, different browser — still
blank.

**Cause:** `hex project import` can only _update_ an existing App canvas. It
cannot bootstrap one from scratch. If no human has ever opened the Hex App
builder and dragged at least one cell onto the canvas, the project doesn't yet
have a draft-app state, and every subsequent `appLayout` import is silently
no-op'd on the App-view side. `hex project export` will faithfully round-trip
the `appLayout` block, making it look like it was applied.

**Confirmed by experiment** (dashboard 2769 migration, 2026-05-15):

1. Built `appLayout` via YAML import in the new project — App view blank.
2. Forced reset (imported empty `appLayout`, re-exported, re-applied) — still
   blank.
3. Tried COLLAPSIBLE-wrapped structure mirroring WOPs Tool — 15 SQL cells
   broke because Jinja can't resolve across COLLAPSIBLE boundaries. Reverted.
4. Created a fresh v2 project from the same YAML — still blank.
5. Cloned the Payments Team Dashboard YAML byte-for-byte into a fresh project
   (since the skill listed Payments as a reference) — also blank.
6. User checked the _original_ Payments dashboard's App view — blank too. The
   skill's claim that Payments had a working App view was wrong; only the
   Logic view ever worked.
7. User confirmed only the WOPs Tool's App view actually renders.
8. Reviewed the WOPs Tool migration transcript: the user manually dragged
   INPUT cells onto the canvas first, **then** `hex project import` added the
   remaining 13 SQL cells. The YAML-only path was never used on a virgin
   project.

**Fix:** Don't try to bootstrap the App view from YAML. After Phase 6a (inputs
/ markdown imported), stop and ask the user to:

> Open `https://app.hex.tech/<workspace>/hex/<project-id>/draft/logic?view=app`
> and drag any one cell from the cell tray onto the canvas. That single action
> initializes Hex's draft-app state. Let me know once it's done and I'll
> re-import the layout to populate the rest.

The cell they drag doesn't need to be in its final position — Phase 6c
overwrites the canvas with the real layout. After the user confirms, re-export
the project, build the real `appLayout`, and re-import. Hex now treats the
import as an update to an initialized canvas and applies it.

**Diagnostic checklist** when you see a blank App view:

- Has the user ever opened `?view=app` and interacted with the canvas?
  If no → this is the gotcha. Don't waste time diffing YAML structures.
- Does `hex project export` show the `appLayout` you imported? If yes → that
  confirms the import "succeeded" structurally but Hex isn't applying it to
  the App view (this is the expected mode of failure).
- Does the Logic view show the cells? If yes → cells are fine, it's purely a
  layout problem.

**Why this isn't surfaced by the CLI:** `hex project import` returns a success
exit code regardless. There's no warning or error about the App view not being
initialized.

## 16. `| array` Jinja filter required for multi-select inputs in SQL

**Symptom:** A SQL cell that references a multi-select dropdown's variable
errors at run time with:

```text
MissingArrayFilterError: Got a list, tuple, or set.
Did you forget to apply '| array' to your query?
For example: `{{ list_of_values | array }}`
```

**Cause:** Hex auto-quotes scalar string inputs into the SQL substitution slot
(see gotcha 4) but refuses to silently choose a serialization for list-typed
inputs. The developer must opt in to the `array` filter, which expands the list
to comma-separated quoted scalars — e.g. `'A', 'B', 'C'`.

**Fix:** Use the filter inside an `IN (...)` clause:

```sql
WHERE w.MSA IN ({{ msa_list | array }})
```

This is the same `{{ var }}` slot gotcha 4 says _not_ to quote — the parens
belong to the SQL (`IN (...)`), not around the Jinja. The `| array` filter is a
no-op for single-select scalars, so the SQL stays forward-compatible if the
input later gets toggled between single- and multi-select.

**Edge — empty selection:** `{% if msa_list %}…{% else %}AND 1=0{% endif %}`
still works. Jinja treats both `None` and an empty list `[]` as falsy, so the
guard branch fires and the query short-circuits to zero rows rather than
scanning unfiltered.

**Incident:** Generalized supply drilldown (`019e64b0-a730-7000-807c-5debd510361e`,
2026-05-26). After the user flipped a `DROPDOWN` input to multi-select in the
Hex UI, both downstream SQL cells errored with `MissingArrayFilterError` on the
next run. Adding `| array` fixed both cells; no other change needed.

## 17. YAML import accepts a narrow INPUT subset — multi-select must be flipped in the UI

**Symptom:** `hex project import` rejects a YAML containing an INPUT cell
whose `inputType` is anything beyond a small allowed list. The error is the
same generic "rejected as malformed" from gotcha 3 — no field-level detail.

**Cause:** The Hex CLI's import endpoint only wires up a subset of the full
INPUT schema. Multi-select, date-picker, and file-picker exist in the product
but the import API isn't connected to them.

**Works via YAML import:**

- `TEXT_INPUT` (outputType `STRING`, `options: null` — gotcha 3)
- Single-select `DROPDOWN` backed by a dataframe column:

  ```yaml
  inputType: DROPDOWN
  name: <var>
  outputType: DYNAMIC
  options:
    valueOptions: { dfName: <sql_cell_dataframe>, variableName: null }
    optional: false
  defaultValue: null
  ```

**Does NOT work via YAML import** (all "malformed" — confirmed 2026-05-26 and
re-confirmed for date variants 2026-06-01):

- `MULTI_SELECT`
- `MULTI_SELECT_INPUT`
- `DROPDOWN` + `multiSelect: true` or `multipleSelect: true`
- `DATE_PICKER` (outputType `DATETIME`)
- `DATE_INPUT`, `DATE` (outputType `DATETIME`)
- `DATE_RANGE`, `DATE_RANGE_PICKER`, `DATERANGE` (outputType `DATE_RANGE`)
- `FILE_INPUT` (outputType `FILE`)

**Pattern for multi-select needs:** push a single-select `DROPDOWN` via YAML
(the supported shape above), then stop and ask the user to flip the multi-select
toggle in the cell's right-sidebar config. SQL `WHERE col IN ({{ var | array }})`
works for both single and multi outputs (the `| array` filter is a no-op for
scalars — see gotcha 16), so the SQL doesn't need to change when the toggle
flips. See the SKILL.md Phase 6a sub-pattern for the full workflow.

**Pattern for date / date-range / file-input needs:** push a `TEXT_INPUT`
placeholder with the snake_case `name` the SQL will reference, ask the user
to change **Input type** in the right sidebar (and toggle **Allow date range**
for ranges), then update SQL to the post-flip access pattern. See gotcha 18
for the date-range variable shape and `yaml_schemas.md` for the resulting
export YAML. Pushing as plain `TEXT_INPUT` with `::timestamp_ntz` casting still
works fine if the user doesn't need calendar UX.

## 18. Date range input — Hex injects two separate variables, `<name>_start` and `<name>_end`

**Symptom:** SQL cell errors with `Undefined variable(s): <base name>` (e.g.
`Undefined variable(s): shift_start_range`) even though the date-range INPUT
cell exists, has a default value set, and is ordered above the SQL cells in
the project. Re-importing the YAML, re-running, and refreshing the App view
don't help.

**Cause:** With `options.useDateRange: true` set on a date input, Hex does
**not** bind the cell's `name` field to any variable. Instead it injects two
new variables suffixed `_start` and `_end`, both `datetime.date`. The base
`name` (e.g. `shift_start_range`) is literally not in scope, so any reference
to it — including `{{ var.start }}`, `{{ var[0] }}`, `{{ var.from_date }}`,
`{% if var %}` — fails with `Undefined variable(s): <base name>`. The error
message is honest, not misleading: the base name truly does not exist.

**Fix:**

```sql
{% if shift_start_range_start %}AND SHIFT_START_AT >= CAST({{ shift_start_range_start }} AS TIMESTAMP_NTZ){% endif %}
{% if shift_start_range_end %}AND SHIFT_START_AT <  DATEADD(day, 1, CAST({{ shift_start_range_end }} AS TIMESTAMP_NTZ)){% endif %}
```

Notes:

- Guard each bound separately. The user can clear one without the other.
- `+1 day` on the upper bound makes the range inclusive of the to-date (Hex
  passes dates at midnight UTC, so `< to_date` excludes the entire to-day).
- The variable type is `datetime.date`, not `datetime.datetime`. Snowflake's
  `CAST(... AS TIMESTAMP_NTZ)` handles either.
- For a _single_ date input (`useDateRange: false`), the variable IS bound to
  the cell's `name` — i.e. `{{ shift_start_range }}` works there. Only the
  range mode rewires the name into `_start`/`_end` suffixes.

**Diagnostic recipe.** When you hit `Undefined variable(s): X` and you can
confirm the input cell defining `X` exists and is above the SQL cells, the
fastest resolution is a one-off Python cell:

```python
for name in ['shift_start_range', 'shift_start_range_start', 'shift_start_range_end',
             'shift_start_range_from', 'shift_start_range_to']:
    val = globals().get(name, '<not in globals>')
    print(f"{name}: type={type(val).__name__} value={val!r}")
```

Run the project, read the output, fix SQL, delete the cell. Beats guessing.

**Incident:** card 21241 migration (project `019e83b9-aed0-723b-9b96-313269b324bc`,
2026-06-01). After the user flipped a `TEXT_INPUT` to a date-range input in
the Hex UI, the project ran with `Undefined variable(s): shift_start_range`.
Wrong attribute patterns I cycled through before adding the diagnostic cell:
`.start`/`.end` (web search suggested), `[0]`/`[1]` (Python list convention).
The diagnostic showed `shift_start_range_start` and `shift_start_range_end`
as the actual names; switching to those resolved both SQL cells.
