Step 1: Install the Plugin

In a new terminal, run `claude --plugin-dir plugins/sdlc`

Step 2: Test Commands

Once in the new Claude session, test each command:

1. Test /sdlc:brief

    - /sdlc:brief Create a user authentication feature
    - Expected: Claude should guide you through creating a product brief

2. Test /sdlc:design

    - /sdlc:design Based on a user authentication brief
    - Expected: Claude should draft a technical design

3. Test /sdlc:code

    - /sdlc:code Implement a simple validation function
    - Expected: Claude should use TDD methodology

Step 3: Test Skills

Ask questions that should trigger skills:

1. SDLC Workflow

    - What are the phases in the AI-first SDLC workflow?

2. TDD Patterns

    - How do I implement features using Red-Green-Refactor?

3. Evidence Bundles

    - How do I create an evidence bundle for a PR?

Step 4: Test Hooks

1. Try to create/edit a file named product-brief.md:

    - Create a file called docs/2026-01-test/product-brief.md

2. Expected: Hook should block and suggest delegating to product-manager

Step 5: Test Agents

The agents trigger based on context. For example:

- During /code, the coder agent should be used
- If blocked by spec issues, product-manager agent should be suggested
