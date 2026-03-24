---
name: hld-architect
description: Use when designing, planning, or architecting a new feature, system, or project that requires a High-Level Design document. This includes starting significant projects, planning major refactors, designing new systems or integrations, or when explicit HLD creation is requested.
---

# HLD Architect

Create comprehensive High-Level Design (HLD) documents that serve as the technical north star for project implementation. The HLD should enable any competent engineer to understand the what, why, and how of a project.

## Process

### Phase 1: Discovery and Validation

1. **Fetch the HLD Guide** — retrieve and read the HLD guide from the [Notion page](https://www.notion.so/High-Level-Designs-HLDs-6799b2fb6b7c4c168aa5cb2de1de4803) to understand the organization's standards and determine if an HLD is appropriate for this request.

2. **Assess HLD Appropriateness** — evaluate whether the work warrants an HLD based on:
   - Scope and complexity of the change
   - Number of systems/teams affected
   - Risk level and reversibility
   - Timeline and resource implications

   If an HLD is not appropriate, explain why and suggest alternatives (technical spec, RFC, or direct implementation).

3. **Understand Requirements** — gather complete context about project goals, constraints, and success criteria. Ask clarifying questions if requirements are ambiguous.

4. **Codebase Analysis** — thoroughly explore the existing codebase to understand:
   - Current architecture and patterns in use
   - Existing systems that will be affected or integrated with
   - Technical debt or constraints that may impact design
   - Relevant abstractions, interfaces, and data models
   - Testing patterns and deployment infrastructure

5. **Historical Context** — search Linear tickets and project history to understand:
   - Previous attempts or discussions related to this problem
   - Known issues or constraints discovered in past work
   - Stakeholder concerns or requirements from earlier conversations

6. **Assumption Validation** — for every assumption, validate against:
   - The actual codebase (not just documentation)
   - Recent commits and changes
   - Linear tickets for context on decisions
   - Document any assumptions that cannot be validated and flag them for review

### Phase 2: Design

1. **Follow the Guide Structure** — adhere strictly to the HLD format specified in the Notion guide, including all required sections.

2. **Design Principles**:
   - Favor simplicity over cleverness
   - Design for change and extensibility where appropriate
   - Consider operational concerns (monitoring, debugging, rollback)
   - Account for failure modes and edge cases
   - Align with existing codebase patterns unless there's strong justification to diverge

3. **Include Critical Sections** (as specified in the guide, typically):
   - Problem Statement and Goals
   - Non-Goals (equally important)
   - Background and Context
   - Proposed Solution with technical details
   - Alternative Approaches Considered
   - Data Model Changes
   - API Contracts
   - Migration Strategy
   - Rollout Plan
   - Risks and Mitigations
   - Open Questions

### Phase 3: Self-Review and Iteration

Before presenting the HLD, conduct a thorough self-review:

1. **Completeness Check** — does the HLD address all stated requirements? Are all guide sections included?
2. **Feasibility Validation** — re-examine the codebase to confirm changes are implementable. Verify referenced systems/APIs exist.
3. **Risk Assessment** — have all significant risks been identified? Are mitigations realistic?
4. **Clarity Review** — could a mid-level engineer implement this? Are there ambiguous sections?
5. **Iterate** — make revisions based on self-review. Document what changed and why.

## Hard Rules

1. **Every claim about the existing system must be verified against code.** Not documentation, not memory — code.
2. **Every alternative considered must have genuine pros/cons analysis.** No token alternatives.
3. **Every risk must have a concrete mitigation strategy.**
4. **Every assumption must be explicitly stated** and validated where possible.
5. **The HLD must be self-contained** — understandable without verbal explanation.
6. **Fetch the HLD guide first.** Don't write an HLD without reading the organization's standards.

## Output Format

Present the HLD in clean, well-structured markdown following the organization's template. Include:

- Clear headers and logical organization
- Diagrams where they add clarity (text or ASCII)
- Code snippets for API contracts, data models, or complex logic
- Tables for comparisons or structured data
- Links to relevant code files, tickets, or documentation

## Cross-Referenced Skills

- `hld-reviewer` — for reviewing completed HLDs before submission
- `investigate-ticket` — for researching issues that may inform the HLD
