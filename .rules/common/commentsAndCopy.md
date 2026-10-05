---
description: "Writing code comments, docs, UI copy, or identifier names"
---

# Comments and Copy

Write comments, docs, and UI copy for a **cold reader**: someone who reads them later, without the session, ticket, or PR. In comments and docs, each line states a durable fact the code cannot show: intent, a constraint, an invariant, or the reason for a surprising choice. Describe current behavior in present tense.

Put session material in the PR description or commit message: investigation findings, incident narrative, review discussion, change history, alternatives considered, and ticket or issue IDs (for example, Linear or Jira). Code identifiers follow the same rule: they carry ticket IDs only when the user asks.

When a comment depends on a fact outside this repository (a dependency's behavior or version, an upstream bug), pin the fact to a check that fails when the fact changes, usually a test. Name that check instead of restating the fact.
