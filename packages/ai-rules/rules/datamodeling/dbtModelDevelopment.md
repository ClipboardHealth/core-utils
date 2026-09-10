---
description: "Developing dbt models: naming, structure, testing"
---

# dbt Model Development

These docs in the data-modeling repo define our modeling rules, patterns, and safety constraints. Read the ones your task touches rather than all of them up front:

- CONTRIBUTING.md
- dbt_style_guide.md
- README.md
- models/DEVIN_ANALYST_MODEL_GUIDE.md
- models/DEVIN_ANALYST_FOLDER_STRUCTURE.md

## Key best practices to follow

- When running dbt commands, reuse the existing `SNOWFLAKE_SCHEMA` environment variable value if it is already set — it is a unique per-session schema; never overwrite it with a hardcoded value.
- Use `dbt build` to verify your changes.
- ALL dbt staging models must have strictly defined datatypes (see the `datamodeling/castingDbtStagingModels` rule). These datatypes need to be defined in the YAML documentation too.
- When adding new fields to tables keep the original source field name format, but remove any custom field prefix (`__c`). For example `assignment_type__c` should be renamed to `assignment_type`. Verify column names against the source table before referencing them — do not guess.
- If a source table doesn't exist, tell the user to ask the data-team to ingest it via the relevant ETL tool.
- A model must always have a primary/unique key. If there's no obvious one, create a surrogate key using a combination of fields and by looking at the data. Use `dbt_utils.generate_surrogate_key` to do so.
- Snapshots must be configured in YAML files (dbt 1.9+ style), not in SQL files. Define the `config` block and `relation` property in the snapshot's `.yml` file instead of using `{% snapshot %}` blocks in `.sql` files.

## Never replace missing columns with NULL

- Never add or reuse logic that substitutes `NULL` for a column because it does not exist in the source or upstream relation. This includes `source_has_column`, `adapter.get_columns_in_relation`, `information_schema` checks, and equivalent helpers or Jinja conditionals that emit `null::type`, `cast(null as type)`, or another placeholder when a column is absent. Existing uses in the repository are not precedent to copy.
- A missing column is a schema or ingestion problem. Hiding it behind a fallback lets builds pass while silently producing incomplete data. This rule also applies to temporary workarounds while waiting for an ETL sync and attempts to make CI pass.
- Verify the exact column name and type in the warehouse using `DESCRIBE TABLE` or an exact `information_schema.columns` lookup. Reference the verified column directly and let missing-column errors surface. Schema inspection is for discovery and validation, not for generating fallback values.
- If a required column is absent, report the fully qualified relation and missing column names, and tell the user the data team must refresh the source schema or ingest the fields through the relevant ETL tool before the model change can be validated and merged. If warehouse access is unavailable, report that validation is blocked; do not assume the column exists or fabricate a replacement.
- Once the fields are ingested, verify them and run `dbt build` for the affected models. A successful build with fabricated all-NULL columns is not validation.
- Normal row-level NULL handling for columns that exist, such as `nullif(trim(column_name), '')`, remains valid.

Forbidden pattern (as seen in [data-modeling PR #4556](https://github.com/ClipboardHealth/data-modeling/pull/4556)):

```sql
{% if source_has_column(source_relation, 'write-off type') %}
    source_data."WRITE-OFF TYPE"::varchar as write_off_type
{% else %}
    null::varchar as write_off_type
{% endif %}
```

After confirming that the source column exists, select it directly:

```sql
source_data."WRITE-OFF TYPE"::varchar as write_off_type
```

## When creating PRs for the data-modeling repo

- Read .github/pull_request_template.md. It contains the structure of how to format the PR description.
- Under the **Validation of models** section in the PR description, print the full table names of the dev models you've built, so it's easy to review the data.
- Keep PR descriptions concise and focused. A reader should be able to quickly understand the intent and scope of the change.
- Include the **dbt commands run** to validate the models.
