---
description: Open a pull request with evidence bundle
argument-hint: [branch-name or 'current branch']
allowed-tools: Read, Write, Edit, Grep, Glob, Bash(*), Task, AskUserQuestion
---

# Pull Request Creation

Open PR for: $ARGUMENTS

## Prerequisites

Before opening PR, ensure:

- All tests passing (code-verifier approved)
- Edge cases tested (critic approved)
- Local review complete (code-reviewer approved)

## Process

1. **Gather context**
   - Identify feature branch and changes
   - Find related ticket and technical design
   - Review all commits in the branch

2. **Collect evidence bundle**

   Use the evidence-bundler agent or collect manually:

   **Test Results**
   - Run full test suite
   - Capture output and coverage

   **Screenshots** (if applicable)
   - Before state
   - After state
   - Same viewport and user state

   **Logs** (if applicable)
   - Relevant log excerpts
   - Remove sensitive data

   **Metrics** (if applicable)
   - Performance comparison
   - Error rate comparison

3. **Calculate complexity score**

   Risk-weighted complexity based on:
   - Lines changed
   - Files affected
   - Sensitive areas touched (auth, payments, etc.)
   - Database migrations
   - Breaking changes

4. **Draft PR description**

   Include:
   - **Summary**: 1-3 bullet points of changes
   - **Links**: Technical design section, ticket
   - **Complexity score**: Low/Medium/High with justification
   - **Focus areas**: What reviewers should examine closely
   - **Evidence bundle**: Test results, screenshots, logs
   - **Verification checklist**: How to verify the change

5. **Create the PR**
   - Use `gh pr create` with formatted description
   - Add appropriate labels
   - Request reviewers if known

6. **Post-creation**
   - Link PR in Linear ticket
   - Update ticket status
   - Notify relevant stakeholders

## PR Description Template

Include in PR description:

- Summary (1-3 bullet points)
- Links to technical design and ticket
- Complexity score with justification
- Focus areas for reviewers
- Evidence bundle (test results, screenshots)
- Verification checklist

See the evidence-bundles skill for detailed templates.

## Output

- Pull request created with comprehensive description
- Evidence bundle attached
- Links to design and ticket included
- Ready for human review

## Important

- Human is the final gate
- Reviewing thousands of lines of agent-generated code daily
- Evidence bundle helps reviewers verify quickly
- Complexity score helps prioritize attention

## Next Steps

After PR created:

- Cloud code review agents run (e.g., CodeRabbit)
- Address any feedback
- Deploy to development environment
- Human reviews and approves
- Proceed to `/deploy` after approval

Use the evidence-bundles skill for evidence collection guidance.
