# About

General knowledge for running data analysis and querying our snowflake data warehouse.

## Understanding dbt Model Relationships and Metadata

Use the dbt-mcp server to:

- Understand DAG relationships and general metadata around dbt models.
- Fetch the full table name in production for a given model.
- Look at dbt cloud runs for CI or production errors instead of other methods.

## Querying Snowflake Data Warehouse (using Snowflake MCP)

- When you need to answer data-related questions or obtain analytics by querying the Snowflake data warehouse, you should use the `mcp-cli` tool.
- When using the Snowflake MCP to run queries, you must set the database context properly in your queries. Use fully qualified table names or set the database context to avoid connection errors.
- The `describe_object` tool in the Snowflake MCP has a bug where it misinterprets the target_object structure, treating the table name as a database name and causing 404 "database does not exist" errors. Use `run_snowflake_query` with "DESCRIBE TABLE" instead to get table schema information successfully.

## Guidelines when using this knowledge:

- Read all of the docs.yml files to learn about the analytics schema.
- When in doubt, read the code in the data-modeling repo to learn how each column is calculated and where the data is coming from
- Strongly prefer to use mart models (defined inside the mart folder, those that don't have an int* or stg* prefix) before int* and stg* models
- Strongly prefer to query tables under the analytics schema, before querying any other schemas like airbyte_db/hevo_database
- If unsure, confirm with the user. Providing suggestions of tables to use
- If required, you might do some data analysis using python instead of pure SQL. Connect to snowflake using a python script and then use libraries like pandas, numpy, seaborn for visualization

## Output format

- When running queries against snowflake and providing the user with a final answer, always show the final query that produced the result along with the result itself, so that the user is able to validate the query makes sense.
- Once you've reached a final query that you need to show to the user, use get_metabase_playground_link to generate a playground link where the user can run the query themselves. Format it as a link with the 'metabase playground link' label as the link text, using slack's markdown format. This is A MUST
- Include charts or tables formatted as markdown if needed
- If the final result is a single number, make sure to show this prominently to the user so it's very easy to see

## Identifying the right columns to use and how to filter data

For categorical columns, you might want to select distinct values for a specific column to see what the possible options are and how to filter data
Read the model definitions in the dbt folders to see how that column is computed and what possible values it might have

## Finding Source Columns for dbt Models

When working on dbt model modifications and you cannot find specific fields in the staging models, use the Snowflake MCP to examine the source tables directly. For example, if fields are not visible in `stg_salesforce__accounts.sql`, examine the `airbyte_database.salesforce_accounts.account` table using Snowflake MCP to identify the actual column names in the source data.

## Column Discovery Best Practices

When discovering columns in Snowflake source tables, use the full table name approach with information_schema.columns and avoid LIKE clauses for more precise results. Use queries like:
`SELECT column_name, data_type FROM airbyte_database.information_schema.columns WHERE table_name = 'EVENT' AND table_schema = 'SALESFORCE' ORDER BY ordinal_position`
Instead of using LIKE clauses or partial matching which can be imprecise.
