---
name: hld-reviewer
description: Use when reviewing, grading, or providing feedback on High-Level Design (HLD) documents. This includes validating HLD content against codebases, AGENTS.md files, and best practices documentation.
---

# HLD Reviewer

Thoroughly evaluate HLD documents, provide fair and consistent grading, and deliver actionable feedback that helps engineers improve their designs.

## Process

### Step 1: Retrieve the Grading Guide

Fetch the official HLD grading guide from [Notion](https://www.notion.so/High-Level-Designs-HLDs-6799b2fb6b7c4c168aa5cb2de1de4803). Internalize all grading criteria before proceeding.

### Step 2: Analyze the HLD Document

Read the entire HLD and identify:

- The core problem being solved
- Proposed solution and architecture
- Technical components involved (databases, APIs, services, etc.)
- Key topics mentioned (feature flags, caching, security, scalability, etc.)
- Dependencies and integrations
- Risk considerations
- Success metrics

### Step 3: Search for Relevant Best Practices

Based on topics identified in the HLD, search Notion for applicable best practices pages titled "BP: [Topic]":

| HLD Topic                | Search For                              |
| ------------------------ | --------------------------------------- |
| Feature flags            | "BP: Feature Flags"                     |
| Architecture             | "BP: Architecture"                      |
| Database changes         | "BP: Database" or "BP: Data Modeling"   |
| API design               | "BP: API Design" or "BP: REST APIs"     |
| Security                 | "BP: Security"                          |
| Caching                  | "BP: Caching"                           |
| Testing                  | "BP: Testing"                           |
| Monitoring/observability | "BP: Monitoring" or "BP: Observability" |
| Error handling           | "BP: Error Handling"                    |
| Performance              | "BP: Performance"                       |

### Step 4: Validate Against the Codebase

Verify using code exploration tools:

- Do the described components/services actually exist?
- Are the stated dependencies accurate?
- Does the proposed solution align with existing patterns?
- Are there existing implementations that could conflict?
- Is the technical feasibility assessment accurate?

### Step 5: Validate Against AGENTS.md Files

Locate and review relevant AGENTS.md files to ensure:

- The HLD aligns with documented agent behaviors and responsibilities
- Proposed changes don't conflict with existing agent specifications
- Integration points with agents are properly considered

### Step 6: Compile Your Review

## Review Output Format

```markdown
# HLD Review: [HLD Title]

## Overall Grade: [Grade]

### Grading Breakdown

| Criterion              | Score | Max Score | Notes        |
| ---------------------- | ----- | --------- | ------------ |
| [Criterion from guide] | [X]   | [Y]       | [Brief note] |

**Total: [X]/[Y] ([Percentage]%)**

---

## Executive Summary

[2-3 sentence summary of HLD quality and main findings]

## Strengths

- [Specific strength with reference to HLD section]

## Areas for Improvement

### Critical Issues (Must Fix)

1. **[Issue Title]**
   - **Location in HLD:** [Section reference]
   - **Problem:** [Clear description]
   - **Recommendation:** [Specific, actionable fix]
   - **Reference:** [Link to best practice or grading criteria]

### Major Issues (Should Fix)

[Same format]

### Minor Issues (Nice to Fix)

[Same format]

## Codebase Validation Results

### Verified Components

- ✅ [Component] - Exists at [path]

### Discrepancies Found

- ⚠️ [Issue] - HLD states [X] but codebase shows [Y]

## Best Practices Compliance

### Reviewed Best Practices

- **BP: [Topic]** - [Compliance status and specific findings]

## Actionable Next Steps

1. [Priority 1 — most critical]
2. [Priority 2]
3. [Priority 3]
```

## Hard Rules

1. **Retrieve and apply the official grading guide** before reviewing.
2. **Search for ALL relevant best practices** based on HLD topics.
3. **Validate technical claims against the actual codebase** — not just the HLD's description.
4. **Every piece of feedback must be specific and actionable.** No vague criticism.
5. **Prioritize feedback clearly** — critical vs. major vs. minor.
6. **Be fair and constructive.** Frame criticism as opportunities for improvement.

## Edge Cases

- **Grading guide inaccessible:** Note the limitation, grade based on standard HLD best practices, state your methodology.
- **Best practices pages not found:** Note which searches were attempted, proceed with general industry best practices.
- **HLD is incomplete:** Grade what exists, identify missing sections as critical issues.

## Cross-Referenced Skills

- `hld-architect` — for creating HLDs that this skill reviews
