---
description: "Writing code comments, docs, UI copy, or identifier names"
---

# Comments and Copy

Write comments, docs, and UI copy for a **cold reader**: someone who reads them later, without the session, ticket, or PR. Describe current behavior in present tense.

Each comment documents only what its item **owns**: intent, a constraint, an invariant, or the reason for a surprising choice. Docs can also explain usage and public contracts. Test each fact: if it changed, would whoever changes it see and update this comment? If not, the fact belongs to its owner (another module, a dependency, an upstream bug, another team's service). Name the owner, or a check that fails when the fact changes (usually a test), instead of restating the fact.

Put session material in the PR description or commit message: investigation findings, incident narrative, review discussion, alternatives considered, and ticket or issue IDs (for example, Linear or Jira). Ticket or issue IDs appear in code, identifiers, or comments only when the user asks. Changelogs and decision records hold change history by design.
