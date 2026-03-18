# Analysis Workflow

Pipeline: `subs.txt → lookup → find-duplicates → analyze → analysis.csv`

## Step 1: Lookup Users

```bash
scripts/cognito-lookup.sh <input_file> [output_file]
```

Converts Cognito subs to user details. Run `--help` for all options.

**Input:** File with one sub per line
**Output:** `sub,username,phone,email,cbh_user_id`

## Step 2: Find Duplicates

```bash
scripts/cognito-find-duplicates.sh <results_csv> [output_file]
```

Searches for other accounts sharing phone or email. Run `--help` for all options.

**Output:** Only rows where duplicates were found.

## Step 3: Analyze Duplicates

```bash
scripts/cognito-analyze-duplicates.sh <duplicates_csv> [output_file]
```

Compares each duplicate against backend API. Run `--help` for all options.

**Requires:** `~/.cbh_token`

### Scoring

Each account gets a score based on backend match:

| Points | Criterion                     |
| ------ | ----------------------------- |
| 100    | `cbh_user_id` matches backend |
| 50     | Email matches                 |
| 25     | Phone matches                 |
| 10     | Status is CONFIRMED           |

**185** = perfect match (all fields + confirmed)
**0-24** = orphaned signup (no backend link)

Highest score → `KEEP_AND_UPDATE`
Others → `DELETE`

### Output Columns

Key columns to review:

- `action` - KEEP_AND_UPDATE or DELETE
- `match_score` - Confidence level
- `match_details` - Which fields matched/mismatched
- `status` - CONFIRMED vs UNCONFIRMED

## Next Steps

After reviewing `analysis.csv`, proceed to [fix-workflow.md](fix-workflow.md).
