# .yaml documentation rules

- The YAML should include the following sections: `version`, `models`, and `columns`.
- At least one column must be the primary key. This column should have both the `not_null` and `unique` tests.
- Every column must include:
  - A `name`
  - A `description`. Use a doc-block if the column already exists in the `docs.md` file. If you see the same column being referenced more than once in the repo, create a doc-block for it.
  - A `data_type`.
  - Include a newline between columns
- Ensure proper YAML formatting and indentation.
- Include a `description` for the model that:
  - Format for human-readability. It is hard to read descriptions as one big block, space out appropriately.
  - Explains what the model is and why it exists.
  - What does each row represent?
  - Mentions important **filtering criteria** or **gotchas** users should be aware of when querying it
  - Uses full sentences in plain, concise English
  - Wraps long text using folded block style (`>`)
- Be concise and to the point.
