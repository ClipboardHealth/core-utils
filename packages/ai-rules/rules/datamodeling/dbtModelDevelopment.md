# Read the following docs in data-modeling repo

- CONTRIBUTING.md
- dbt_style_guide.md
- README.md
- models/DEVIN_ANALYST_MODEL_GUIDE.md
- models/DEVIN_ANALYST_FOLDER_STRUCTURE.md
- .github/pull_request_template.md

These define our modeling rules, patterns, and safety constraints.

# Key best practices to follow

- DEVIN ONLY: When running dbt commands in the data-modeling repository, always reuse the existing SNOWFLAKE_SCHEMA environment variable value that is already set. Do NOT replace it with a hardcoded value like "dbt_devin" - the SNOWFLAKE_SCHEMA is set to a unique per-session string and overwriting it will cause issues.
- Use `dbt build` to verify your changes.
- ALL dbt staging models must have strictly defined datatypes. Please Read the "Casting DBT Staging Model Datatype Heuristic" Knowledge we have. These datatypes need to defined in the yaml documentation too.
- When adding new fields to tables keep the original source field name format, but remove any custom field prefix (**c). For example assignment_type**c should be renamed to assignment_type. Please do not hallucinate the column field names as this is misleading for users.
- If a source table doesn't exist. Please tell the user to ask the data-team to ingest it via the relevant ETL tool.
- A model must always have a primary/unique key. If there's no obvious one, please create a surrogate key using a combination of fields and by looking at the data. Use `dbt_utils.generate_surrogate_key` to do so.

# When creating PR's for the data-modeling repo

- Read .github/pull_request_template.md. It contains the structure of how you would format the PR Description.
- Under the **Validation of models** section in the PR Description, print the full table names of the dev models you've built, so it's easy for us to review the data.
- Keep PR descriptions concise and focused. A reader should be able to quickly understand the intent and scope of the change.
- Include the **dbt commands run** to validate the models.
