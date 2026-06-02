# Hex YAML cell shapes — exact schemas

Hex's YAML import is picky. Use the shapes below verbatim. These are the only YAML
constructs the round-trip path supports for adding new cells programmatically.

## Top-level structure

```yaml
schemaVersion: 3
meta:
  sourceVersionId: <do not change>
  description: ...
  projectId: <do not change — Hex matches imports by this>
  title: ...
  timezone: null
  appTheme: SYS_PREF
  codeLanguage: PYTHON
  status: { name: Development }
  # ... other meta fields preserved from export ...
projectAssets: { dataConnections: [], envVars: [], secrets: [] }
sharedAssets:
  secrets: []
  vcsPackages: []
  dataConnections:
    - dataConnectionId: <conn-id>
  externalFileIntegrations: []
cells:
  - <cell> # SQL cells (already created by hex cell create)
  - <cell> # INPUT cells (added during YAML round-trip)
  - <cell> # MARKDOWN cells (added during YAML round-trip)
appLayout:
  visibleMetadataFields:
    [NAME, DESCRIPTION, AUTHOR, LAST_EDITED, LAST_RUN, CATEGORIES, STATUS, TABLE_OF_CONTENTS]
  fullWidth: true
  tabs:
    - name: <tab-name>
      rows: [...]
sharedFilters: []
```

## SQL cell (created by `hex cell create -t sql`)

```yaml
- cellType: SQL
  cellId: <hex-assigned-uuid7>
  cellLabel: <human-readable label>
  config:
    source: |-
      SELECT ...
      FROM ...
      WHERE col = {{ shift_id }}    # NO QUOTES around {{ var }}
    dataFrameCell: false
    dataConnectionId: f5606b78-4aba-4d11-9820-8712a8c765b2
    resultVariableName: <snake_case_slug>
    useRichDisplay: true
    enablePreview: true
    sqlCellOutputType: PANDAS
    useQueryMode: false
    castDecimals: true
    useNativeDates: true
    outputFilteredResult: true
    allowDuplicateColumns: false
    tableDisplayConfig:
      pageSize: 50
      # ... other display config preserved from export ...
```

You will rarely hand-write SQL cells. Create them with `hex cell create` and edit
their `source` only if you need to re-push fixes (use `hex cell update`).

## INPUT cell (added via YAML round-trip)

```yaml
- cellType: INPUT
  cellId: <fresh uuidv7>
  cellLabel: Shift ID # what the UI shows above the box
  config:
    inputType: TEXT_INPUT
    name: shift_id # the Jinja variable name — MUST match SQL refs
    outputType: STRING
    options: null # required key — omitting it = malformed import
    defaultValue: "" # or a sample value to pre-populate
```

Key constraints:

- `options: null` is **required** for `TEXT_INPUT`. Omitting it triggers a
  generic "request was rejected as malformed" error during `hex project import`.
- Do **not** add `label:` inside `config`. Only `cellLabel` at the cell level.
- `name` is the Jinja variable, not just a display thing. The SQL cells reference
  it as `{{ shift_id }}` and `{% if shift_id %}`.

### Dropdown backed by a SQL cell (single-select)

```yaml
- cellType: INPUT
  cellId: <fresh uuidv7>
  cellLabel: MSA list # what the UI shows above the dropdown
  config:
    inputType: DROPDOWN
    name: msa_list # the Jinja variable name
    outputType: DYNAMIC
    options:
      valueOptions:
        dfName: msa_options # SQL cell whose first column becomes the dropdown values
        variableName: null
      optional: false # set true to allow no selection
    defaultValue: null
```

Notes:

- `options.valueOptions.dfName` references the **SQL cell's output dataframe
  name**. The YAML key for that on a SQL cell is `resultVariableName` (see the
  SQL cell shape above), which is what `hex cell create --output-dataframe <name>`
  writes. If you grep for `outputDataframe` you'll come up empty — the YAML
  exports use `resultVariableName`.
- The options SQL cell must be **run at least once** for the dataframe to
  materialize, otherwise the dropdown is empty. After a fresh import, trigger
  `hex project run` so the kernel populates it.
- **Multi-select is NOT settable via YAML.** Push this exact single-select shape
  and ask the user to flip the multi-select toggle in the cell's right-sidebar
  config. The SQL referencing the variable should use `IN ({{ var | array }})`,
  which is a no-op for single-select scalars but required once multi-select is
  on (see gotchas 10/16).

### Date input — single date or date range (set via UI, then SQL update)

Date inputs (single or range) cannot be created via YAML import. Every variant
tried — `DATE_PICKER`, `DATE_INPUT`, `DATE`, `DATE_RANGE`, `DATE_RANGE_PICKER`,
`DATERANGE` — is rejected as "malformed" (gotcha 17). The working flow is:

1. Push a `TEXT_INPUT` placeholder with the same `name`. Use a snake_case name
   the SQL can reference even after the type changes (e.g. `shift_start_range`).
2. Ask the user to open the cell in the UI and change **Input type** to
   `Date`. For a range, they then toggle **Allow date range** on the same cell.
3. _Then_ push SQL that references the variable correctly (see access patterns
   below).

After the UI flip, the cell's YAML export looks like this (do not hand-write
it — Hex's import API still rejects it; capture it via `hex project export`
only for diffing / understanding):

```yaml
# Single date
- cellType: INPUT
  cellId: <id>
  cellLabel: As-of date
  config:
    inputType: DATE
    name: as_of_date
    outputType: DATETIME # Hex returns a datetime.datetime
    options:
      enableTime: false
      showRelativeDates: true
      useDateRange: false
    defaultValue:
      - dateString: 2026-06-01

# Date range — same cell, useDateRange: true, defaultValue has TWO entries
- cellType: INPUT
  cellId: <id>
  cellLabel: Shift start range
  config:
    inputType: DATE
    name: shift_start_range
    outputType: DATETIME
    options:
      enableTime: false
      showRelativeDates: true
      useDateRange: true
    defaultValue:
      - dateString: 2025-10-17
      - dateString: 2025-10-30
```

**Jinja access pattern for date range — two separate variables suffixed
`_start` and `_end`.** With `options.useDateRange: true`, Hex does **not**
bind the cell's `name` to anything; instead it injects two new variables
`<name>_start` and `<name>_end`, both `datetime.date`. Referencing the base
`name` (e.g. `{{ shift_start_range }}`, `.start`, `.end`, `[0]`, `[1]`) all
fail with `Undefined variable(s): <base name>` because the base is literally
not in scope. Use:

```sql
{% if shift_start_range_start %}AND SHIFT_START_AT >= CAST({{ shift_start_range_start }} AS TIMESTAMP_NTZ){% endif %}
{% if shift_start_range_end %}AND SHIFT_START_AT <  DATEADD(day, 1, CAST({{ shift_start_range_end }} AS TIMESTAMP_NTZ)){% endif %}
```

The two `if` guards short-circuit when either bound is cleared in the UI. The
`+1 day` on the upper bound makes the range inclusive of the to-date (Hex
passes dates at midnight UTC, so `< to_date` would exclude the to-day).

**How to verify the variable name for any input cell:** create a one-off Python
diagnostic cell with `globals().get('<candidate>', '<not in globals>')` for
each plausible name (`<name>`, `<name>_start`, `<name>_end`, `<name>_from`,
`<name>_to`, etc.). Run the project, read the output, fix SQL, then delete the
cell. This took ~2 minutes on the card 21241 migration and saved guessing.

Confirmed shape on project `019e83b9-aed0-723b-9b96-313269b324bc` (card 21241
migration, 2026-06-01). The `name` field in the YAML is essentially a _prefix_
for date-range inputs, not the variable name itself.

### Other input types

Hex also supports `NUMERIC_INPUT`, `SLIDER`, `FILE_INPUT`, etc. — but the YAML
import API only accepts `TEXT_INPUT` and the single-select `DROPDOWN` shape
above. For everything else, push `TEXT_INPUT` and cast/parse in SQL or Python,
or stop after the cells are imported and ask the user to configure the input
type in the Hex UI. See gotcha 17 for the full accepted/rejected list.

## MARKDOWN cell (added via YAML round-trip)

```yaml
- cellType: MARKDOWN
  cellId: <fresh uuidv7>
  config:
    source: |
      ## Section header

      Body text in CommonMark markdown. Hex renders it inline.
```

No `cellLabel` for markdown cells. If you set one, Hex preserves it but the UI
doesn't surface it.

## appLayout — tabs / rows / columns / elements

```yaml
appLayout:
  fullWidth: true # full-width vs centered narrow column
  tabs:
    - name: Main
      rows:
        # Row 1: three inputs side-by-side
        - columns:
            - start: 0
              end: 40
              elements:
                - <cell-element>
            - start: 40
              end: 80
              elements:
                - <cell-element>
            - start: 80
              end: 120
              elements:
                - <cell-element>
        # Row 2: full-width SQL output
        - columns:
            - start: 0
              end: 120
              elements:
                - <cell-element>
```

Columns span 0–120. Common patterns:

- Full width: `start: 0, end: 120`
- Halves: `start: 0, end: 60` and `start: 60, end: 120`
- Thirds: `start: 0/40/80, end: 40/80/120`
- Quarters: 0/30/60/90/120

Multiple `elements` per column stack vertically.

## Cell element shape (inside `elements: []`)

```python
{
    "showSource": False,        # hide the SQL source pane (True = developer view)
    "hideOutput": False,        # show the SQL result
    "type": "CELL",             # always CELL for this layout
    "cellId": "<id>",           # the cell to render here
    "sharedFilterId": None,
    "height": None,             # auto-fit
    "showLabel": True,          # show the cellLabel above the cell
    "explorable": None,
}
```

Use exactly these keys with exactly these defaults unless you have a specific UI
need. Hex's parser is sensitive to missing keys.
