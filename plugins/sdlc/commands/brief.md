---
description: Create or refine a product brief with success criteria
argument-hint: [feature-name or description]
allowed-tools: Read, Write, Edit, Grep, Glob, Bash(git:*), WebSearch, WebFetch, Task, AskUserQuestion
---

# Product Brief Creation

Create a product brief for: $ARGUMENTS

## Process

1. **Understand the problem**
   - Ask clarifying questions about the problem being solved
   - Identify target users and their pain points
   - Gather relevant data or research if available

2. **Create documentation structure**
   - Determine feature name (kebab-case)
   - Create directory: `docs/YYYY-MM-feature-name/`
   - Create file: `product-brief.md`

3. **Draft the brief** using this structure:
   - Problem Statement (clear, concise)
   - Context (background, data, research)
   - Success Criteria (Gherkin scenarios preferred)
   - Non-functional requirements (performance, security)
   - Scope (in-scope, out-of-scope)
   - Evidence Bundle (data sources, citations)
   - Open Questions

4. **Gather success criteria**
   - Write Gherkin scenarios for key behaviors
   - Define contract tests where applicable
   - Specify measurable outcomes

5. **Review and refine**
   - Ensure problem is clearly defined
   - Verify success criteria are testable
   - Confirm scope is appropriate

## Output

Save to `docs/YYYY-MM-feature-name/product-brief.md` following the template in the sdlc-workflow skill.

## Next Steps

After completing the brief:

- Human reviews and approves
- Proceed to `/design` for technical design
- Link brief in Linear for tracking

Use the sdlc-workflow skill for document templates and workflow guidance.
