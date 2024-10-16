<h1 align="center">core-utils</h1>
<p align="center">
  <a href="https://www.clipboardhealth.com/"><img alt="Clipboard Health logo." src="./static/logo.png"></a>
</p>

Clipboard Health's core libraries and utilities. See individual package `README`s for specific library details.

## Table of contents <!-- omit from toc -->

- [Local development commands](#local-development-commands)
- [Adding or porting libraries](#adding-or-porting-libraries)
- [Contributing](#contributing)

## Local development commands

See [`package.json`](./package.json) `scripts` for a complete list of commands.

See [Nx CLI Commands](https://nx.dev/reference/commands#nx-cli-commands) for options or `npx nx --help`.

```bash
# Install dependencies
npm install

# Build, lint, and test only changed files from `main`, helpful prior to opening PRs
npm run affected

# For the paranoid: build, lint, and test everything
npm run all

# Install a dependency in a specific package
npm install --workspace packages/[PROJECT_NAME] [DEPENDENCY]

# Run specific commands against a specific packages
npx nx run [PROJECT_NAME]:[COMMAND]

# Upgrade Nx
npx nx migrate latest && \
  npm install && \
  npm_config_legacy_peer_deps=false npx nx migrate --run-migrations --if-exists
```

## Adding or porting libraries

See our [Nx generator plugin](https://github.com/ClipboardHealth/core-utils/tree/main/packages/nx-plugin).

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).
