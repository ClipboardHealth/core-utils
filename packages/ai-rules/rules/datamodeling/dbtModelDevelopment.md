---
description: "Developing dbt models: naming, structure, testing"
---

# dbt Model Development

Read the following docs in the data-modeling repo; they define our modeling rules, patterns, and safety constraints:

- CONTRIBUTING.md
- dbt_style_guide.md
- README.md
- models/DEVIN_ANALYST_MODEL_GUIDE.md
- models/DEVIN_ANALYST_FOLDER_STRUCTURE.md
- .github/pull_request_template.md

## Key best practices to follow

- When running dbt commands, reuse the existing `SNOWFLAKE_SCHEMA` environment variable value if it is already set — it is a unique per-session schema; never overwrite it with a hardcoded value.
- Use `dbt build` to verify your changes.
- ALL dbt staging models must have strictly defined datatypes (see the `datamodeling/castingDbtStagingModels` rule). These datatypes need to be defined in the YAML documentation too.
- When adding new fields to tables keep the original source field name format, but remove any custom field prefix (`__c`). For example `assignment_type__c` should be renamed to `assignment_type`. Verify column names against the source table before referencing them — do not guess.
- If a source table doesn't exist, tell the user to ask the data-team to ingest it via the relevant ETL tool.
- A model must always have a primary/unique key. If there's no obvious one, create a surrogate key using a combination of fields and by looking at the data. Use `dbt_utils.generate_surrogate_key` to do so.
- Snapshots must be configured in YAML files (dbt 1.9+ style), not in SQL files. Define the `config` block and `relation` property in the snapshot's `.yml` file instead of using `{% snapshot %}` blocks in `.sql` files.

## When creating PRs for the data-modeling repo

- Read .github/pull_request_template.md. It contains the structure of how to format the PR description.
- Under the **Validation of models** section in the PR description, print the full table names of the dev models you've built, so it's easy to review the data.
- Keep PR descriptions concise and focused. A reader should be able to quickly understand the intent and scope of the change.
- Include the **dbt commands run** to validate the models.
