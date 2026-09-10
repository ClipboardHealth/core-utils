---
description: "Developing dbt models or diagnosing schema and ingestion failures"
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
- ALL dbt staging models must have strictly defined datatypes (see the `datamodeling/castingDbtStagingModels` rule). These datatypes need to be defined in the YAML documentation too.
- When adding new fields to tables keep the original source field name format, but remove any custom field prefix (`__c`). For example `assignment_type__c` should be renamed to `assignment_type`.
- A model must always have a primary/unique key. If there's no obvious one, create a surrogate key using a combination of fields and by looking at the data. Use `dbt_utils.generate_surrogate_key` to do so.
- Snapshots must be configured in YAML files (dbt 1.9+ style), not in SQL files. Define the `config` block and `relation` property in the snapshot's `.yml` file instead of using `{% snapshot %}` blocks in `.sql` files.

## Verify required columns

A column is required when its input relation's declared schema or the requested model behavior expects it, even without an enforced dbt contract. Reference verified required columns directly; never use `source_has_column` or equivalent logic to replace absent required columns with NULL or another placeholder, including temporary ETL or CI workarounds. These fallbacks let builds pass with incomplete data.

1. **Identify and verify.** Identify every required input column and verify its exact name and type in the warehouse. For source inspection, follow [Analytics: Finding Source Columns and Column Discovery](analytics.md#finding-source-columns-for-dbt-models).
2. **Resolve.** Trace each missing column to its source. If the raw source table or field is absent, report the fully qualified relation and missing fields and ask the user to have the data team refresh the schema or ingest them. If the field exists upstream, repair the dbt projection, alias, or stale model build. If warehouse access is unavailable, report validation as blocked and name what remains unverified.
3. **Build.** Validation is complete when every required input column has been verified, the model references those columns directly, and `dbt build` succeeds for the affected models. Otherwise, report the specific unresolved blocker before merge.

After verification, select the column directly:

```sql
source_data."WRITE-OFF TYPE"::varchar as write_off_type
```

Normal row-level NULL handling, such as `nullif(trim(column_name), '')`, remains valid. Intentional schema alignment with `dbt_utils.union_relations` or `UNION ALL BY NAME` may fill non-applicable fields with NULL: document which fields are absent from each input and why, and verify every input's required columns before alignment. Only deliberately non-applicable fields qualify; unexpected gaps and fields awaiting ingestion remain blockers.

## When creating PRs for the data-modeling repo

- Read .github/pull_request_template.md. It contains the structure of how to format the PR description.
- Under the **Validation of models** section in the PR description, print the full table names of the dev models you've built, so it's easy to review the data.
- Keep PR descriptions concise and focused. A reader should be able to quickly understand the intent and scope of the change.
- Include the **dbt commands run** to validate the models.
