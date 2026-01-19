# Agent Handoff Patterns

## Overview

This document describes how agents coordinate and hand off work to each other in the AI-first SDLC workflow. Agents operate semi-autonomously, proposing actions and waiting for human approval.

## Agent Responsibilities

### Coder Agent

**Primary responsibility:** Implement code using TDD

**Can do:**

- Write and run tests
- Write implementation code
- Refactor existing code
- Commit changes

**Cannot do:**

- Modify specs or interfaces (blocked by hook)
- Change acceptance criteria
- Make architectural decisions outside ticket scope

**Delegates to:**

- `product-manager` when spec changes needed
- `code-verifier` when implementation complete

### Product Manager Agent

**Primary responsibility:** Handle spec and requirement changes

**Can do:**

- Propose spec modifications
- Update acceptance criteria
- Clarify requirements
- Update tickets

**Delegates to:**

- `coder` after spec clarification
- Human for significant scope changes

### Code Verifier Agent

**Primary responsibility:** Validate code quality

**Can do:**

- Run type checking
- Run linting
- Run tests
- Report issues

**Delegates to:**

- `coder` when issues found
- `critic` when verification passes

### Critic Agent

**Primary responsibility:** Find edge cases and potential issues

**Can do:**

- Write negative test cases
- Identify edge cases
- Stress test implementations
- Report vulnerabilities

**Delegates to:**

- `coder` when issues found
- `code-reviewer` when satisfied

### Code Reviewer Agent

**Primary responsibility:** Review code quality before PR

**Can do:**

- Auto-fix minor issues (formatting, simple refactors)
- Flag major issues for human review
- Suggest improvements
- Check adherence to design

**Delegates to:**

- `coder` for major issues
- `evidence-bundler` when review passes

### Evidence Bundler Agent

**Primary responsibility:** Create PR evidence bundle

**Can do:**

- Capture screenshots
- Collect logs
- Gather test results
- Compile metrics

**Delegates to:**

- Human for PR approval

### Deployment Monitor Agent

**Primary responsibility:** Monitor deployments

**Can do:**

- Monitor error rates
- Track latency metrics
- Detect anomalies
- Propose rollback

**Delegates to:**

- Human for rollback approval
- Human for rollout progression

## Handoff Protocol

### Standard Handoff

1. **Agent A completes work**
   - Summarize completed work
   - List any issues or concerns
   - Specify next agent and reason

2. **Propose handoff to human**
   - "I've completed [work]. Ready to hand off to [Agent B]"
   - "[X issues] to address"
   - "Proceed with handoff?"

3. **Human approves**

4. **Agent B receives context**
   - Summary from Agent A
   - Current state
   - Expected outcome

### Blocked Handoff (Coder to Product Manager)

When coder cannot proceed due to spec issues:

1. **Coder attempts work**
   - Discovers spec conflict/ambiguity
   - Cannot resolve within scope

2. **Coder proposes delegation**
   - "I'm blocked because [reason]"
   - "The spec says [X] but [Y] is needed"
   - "Recommending handoff to product-manager"

3. **Human approves delegation**

4. **Product Manager receives**
   - Original ticket context
   - Coder's blocking issue
   - Proposed resolution options

5. **Product Manager proposes spec change**
   - Updated acceptance criteria
   - Justification

6. **Human approves spec change**

7. **Coder receives updated spec and continues**

### Verification Chain Handoff

After implementation complete:

1. **Coder completes implementation**

2. **Code Verifier** (FAIL returns to Coder)
   - Type check
   - Lint
   - Tests

3. **Critic** (FAIL returns to Coder)
   - Edge cases
   - Stress tests

4. **Code Reviewer** (major issues return to Coder)
   - Minor issues: auto-fix
   - Major issues: back to Coder

5. **Evidence Bundler**
   - Collect evidence
   - Create PR

6. **Human Review**

## Handoff Message Format

### From Coder

```markdown
## Handoff: Coder → Code Verifier

### Completed Work

- Implemented [feature] per ticket [XX]
- Added [N] unit tests
- Coverage: [X]%

### Test Results

- All local tests passing
- [Any specific notes]

### Concerns

- [Any edge cases to verify]
- [Any assumptions made]

### Ready for: Type checking, linting, full test suite
```

### From Code Verifier

```markdown
## Handoff: Code Verifier → Critic

### Verification Results

- Type check: ✅ PASS
- Lint: ✅ PASS
- Tests: ✅ PASS ([N] tests, [X]% coverage)

### Notes

- [Any warnings to review]
- [Coverage gaps to consider]

### Ready for: Edge case testing, stress testing
```

### From Critic

```markdown
## Handoff: Critic → Code Reviewer

### Testing Results

- Edge cases: ✅ [N] scenarios tested
- Negative tests: ✅ [N] tests added
- Stress tests: ✅ No issues under load

### Added Tests

- [Test 1]: [scenario]
- [Test 2]: [scenario]

### Ready for: Code review, PR preparation
```

### From Code Reviewer

```markdown
## Handoff: Code Reviewer → Evidence Bundler

### Review Results

- Code quality: ✅ PASS
- Design adherence: ✅ Matches technical design
- Auto-fixed: [N] minor issues

### Suggestions (non-blocking)

- [Optional improvement 1]
- [Optional improvement 2]

### Ready for: Evidence collection, PR creation
```

## Error Handling

### Verification Failure

When code-verifier finds issues:

1. **Categorize issues**: type error, lint error, or test failure
2. **Assess severity**: critical, major, or minor
3. **Report to human**: "Verification failed: [N] issues" with locations
4. **Human approves return to coder**
5. **Coder receives**: error messages, file locations, suggested fixes

### Critic Finds Issues

When critic discovers problems:

1. **Document failing scenario**
2. **Classify**: bug, missing feature, or spec gap
3. **For bugs/missing features**: Report to human, propose return to coder
4. **For spec gaps**: Propose delegation to product-manager

## Context Preservation

### Information to Pass

Each handoff includes:

1. **Ticket context** - Original ticket requirements
2. **Work summary** - What was completed
3. **Current state** - Files modified, tests added
4. **Issues** - Any problems or concerns
5. **Next steps** - What the receiving agent should do

### State Persistence

Agents should record state in:

1. **Git commits** - Code changes with clear messages
2. **Ticket updates** - Progress notes in ticket markdown
3. **PR description** - Cumulative work summary

## Human Intervention Points

Humans must approve:

1. **All handoffs** - Confirm agent transitions
2. **Spec changes** - Product manager proposals
3. **Major fixes** - Significant code changes from review
4. **Rollback** - Deployment issues
5. **PR merge** - Final gate before production
