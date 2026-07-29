---
description: "Adding dependencies, implementing functionality, or debugging errors involving a @clipboard-health/* library"
---

# Core Libraries

Clipboard's shared `@clipboard-health/*` libraries live in two repositories: `ClipboardHealth/core-utils` (public) and `ClipboardHealth/cbh-core` (private). Check what already exists in both before adding a third-party dependency or writing functionality from scratch.

## Finding out what exists

Each repository's README carries an auto-generated `## Libraries` section listing every package with a one-line description. `gh` is authenticated, so the private repository reads the same way as the public one:

```bash
gh api -H "Accept: application/vnd.github.raw" repos/ClipboardHealth/core-utils/contents/README.md
gh api -H "Accept: application/vnd.github.raw" repos/ClipboardHealth/cbh-core/contents/README.md
```

To list package names alone, without descriptions:

```bash
gh api repos/ClipboardHealth/cbh-core/contents/packages --jq '.[] | select(.type=="dir") | .name'
```

## Reading a library's documentation

- Installed: `node_modules/@clipboard-health/{LIBRARY_NAME}/README.md`
- Not installed: `gh api -H "Accept: application/vnd.github.raw" repos/ClipboardHealth/{core-utils OR cbh-core}/contents/packages/{LIBRARY_NAME}/README.md`

## Debugging

When a bug traces into a `@clipboard-health/*` library, read the source code in `node_modules/@clipboard-health/{LIBRARY_NAME}/` to find the root cause. Do not stop at the library boundary.
