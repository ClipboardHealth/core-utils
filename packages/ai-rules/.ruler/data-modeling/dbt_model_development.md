# Read the following docs in data-modeling repo
- CONTRIBUTING.md
- dbt_style_guide.md
- README.md
- models/DEVIN_ANALYST_MODEL_GUIDE.md
- models/DEVIN_ANALYST_FOLDER_STRUCTURE.md
These define our modeling rules, patterns, and safety constraints.

# Key best practices to follow
- ALL dbt staging models must have strictly defined datatypes. Please Read the "Casting DBT Staging Model Datatype Heuristic" Knowledge we have. These datatypes need to defined in the yaml documentation too.
- Use doc blocks for any YAML column descriptions that span across more than one model. Do NOT repeat descriptions for the same column - please reuse a doc-block!
- When adding new fields to tables keep the original source field name format, but remove any custom field prefix (__c). For example assignment_type__c should be renamed to assignment_type. Please do not hallucinate the column field names as this is misleading for users.
- If a source table doesn't exist. Please tell the user to ask the data-team to ingest it via the relevant ETL tool.
- A model must always have a primary/unique key. If there's no obvious one, please create a surrogate key using a combination of fields and by looking at the data. Use `dbt_utils.generate_surrogate_key` to do so.
- Keep It Simple. Don't overcomplicate.
