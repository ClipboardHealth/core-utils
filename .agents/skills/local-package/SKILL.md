---
name: local-package
description: Use Clipboard's internal CLI to link and unlink @clipboard-health packages across repositories for local development. Use when testing local package changes, linking @clipboard-health packages between repos, or using the cbh CLI local-package command.
---

# Local Package Development

Use Clipboard's internal CLI (`@clipboard-health/cli`) to test package changes across repositories without publishing. The `cbh local-package` command wraps [yalc](https://www.npmjs.com/package/yalc) to simplify linking packages between sibling repositories.

## Prerequisites

See the [CLI README](https://github.com/ClipboardHealth/cbh-core/tree/main/packages/cli#local-package) for setup instructions.

## Commands

### Link packages

From the consuming repository, link packages from sibling repos:

```bash
cbh local-package link --packages <package-names...>
```

Example:

```bash
cbh local-package link --packages ui-theme ui-components
```

This will:

1. Find the package in sibling `packages/*` directories
2. Build the package with nx
3. Push the built package to yalc
4. Update your `package.json` to use the yalc version

### Unlink packages

After testing, restore the published package versions:

```bash
cbh local-package unlink --packages <package-names...>
```

Example:

```bash
cbh local-package unlink --packages ui-theme ui-components
```

## Workflow Example

To test changes to `ui-theme` in `cbh-mobile-app`:

1. Make changes to `ui-theme` in `cbh-core`
2. From `cbh-mobile-app` root, run:

   ```bash
   cbh local-package link --packages ui-theme
   ```

3. Test your changes in `cbh-mobile-app`
4. When done, unlink:

   ```bash
   cbh local-package unlink --packages ui-theme
   ```

## Troubleshooting

- **Package not found**: Ensure the package exists in a sibling repo's `packages/` directory
- **Build fails**: The package must have a valid nx build target
- **Changes not reflected**: Run `npm install` after linking to pull in the yalc version
