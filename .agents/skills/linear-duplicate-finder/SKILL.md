---
name: linear-duplicate-finder
description: Use when checking if a Linear ticket already exists before creating one. Searches across teams, archived tickets, and multiple phrasings to find duplicates and related tickets. Dispatched by ticket-writing skills before creation.
---

# Linear Duplicate Finder

Search Linear for duplicate or related tickets before creating a new one. Casts a wide net across teams, statuses, and phrasings, then classifies matches by similarity.

## Inputs

1. **A Linear ticket ID** (e.g., "ENG-1234") — fetch its details and search for duplicates.
2. **A ticket title + description** — search Linear directly for matches.
3. **Multiple ticket IDs** — cross-reference against each other and the backlog.

## Process

### Step 1: Understand the Source

If given a ticket ID:

- Fetch the ticket using `mcp__linear__get_issue` with `includeRelations: true` to see if duplicates are already marked.
- Extract the title, description, labels, team, and project.

If given a title/description:

- Parse the key concepts, features, and domain terms.

### Step 2: Generate Search Queries

Break the ticket down into multiple search angles:

- **Exact title keywords**: Most distinctive terms from the title.
- **Core concept**: The fundamental ask, using different phrasings.
- **Domain/feature area**: The feature area or system component involved.
- **Synonyms and alternative phrasings**: 2-3 alternative ways to describe the same thing.

### Step 3: Execute Searches

Run multiple `mcp__linear__list_issues` searches in parallel using the `query` parameter with different search terms:

- Use `limit: 50` to cast a wide net.
- Include `includeArchived: true` to catch completed or cancelled tickets.
- Filter by team when known, but also do at least one cross-team search.

Also use `mcp__linear__query_data` with natural language queries for concept-based matching.

Run at least 3-5 different searches with varied query terms.

### Step 4: Analyze and Score Results

| Dimension               | Weight | Description                                            |
| ----------------------- | ------ | ------------------------------------------------------ |
| **Title similarity**    | High   | Do the titles describe the same thing?                 |
| **Description overlap** | High   | Do the descriptions reference the same problem?        |
| **Same feature area**   | Medium | Are they about the same system/feature?                |
| **Same team/project**   | Low    | Same team increases likelihood but isn't required.     |
| **Status**              | Info   | Cancelled/completed duplicates are still worth noting. |

### Step 5: Classify Matches

- **Duplicate**: Exact same work. Creating both = redundant effort.
- **Closely Related**: Overlapping scope — completing one partially addresses the other. Should cross-reference.
- **Same Area**: Same domain but different aspects. Useful context, not duplicates.

### Step 6: Present Results

```text
## Duplicate Detection Results

### Source
**[ID] Title** or **Potential ticket**: "description"

### Duplicates Found
1. **[TEAM-123] Title** — Status: In Progress
   - **Why**: [specific overlap]
   - **Key difference**: [if any]

### Closely Related
1. **[TEAM-456] Title** — Status: Backlog
   - **Overlap**: [what's shared]
   - **Difference**: [what's distinct]

### Same Area (Context)
1. **[TEAM-789] Title** — Status: Done
   - **Relevance**: [why worth noting]

### Recommendation
[Proceed, merge with existing, or add context to related ticket?]
```

If no duplicates found, say so clearly and recommend proceeding.

## Guidelines

- **Wide net, then narrow.** Better to surface a false positive than miss a real duplicate.
- **Search across teams.** Duplicates often live on different teams.
- **Check archived/cancelled tickets.** May contain valuable context about why work was previously rejected.
- **Look at different time ranges.** Duplicates can be months old.
- **Be specific.** Don't say "similar title" — explain exactly what overlaps and differs.
- **When in doubt, include it.** A false positive is cheap; a missed duplicate wastes engineering effort.
