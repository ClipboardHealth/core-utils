<h1 align="center">core-utils</h1>
<p align="center">
  <a href="https://www.clipboardhealth.com/"><img alt="Clipboard Health logo." src="./static/logo.png"></a>
</p>

<h4 align="center">
   <a href="https://github.com/RichardLitt/standard-readme">
    <img src="https://img.shields.io/badge/readme%20style-standard-brightgreen.svg" alt="Standard README compliant">
  </a>
</h4>

Clipboard Health's core libraries and utilities. See individual package `README`s for specific library details.

- [Local development commands](#local-development-commands)
- [Adding new or porting existing libraries](#adding-new-or-porting-existing-libraries)
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
  npx nx migrate --run-migrations --if-exists
```

## Adding or porting libraries

See our [Nx generator plugin](https://github.com/ClipboardHealth/core-utils/tree/main/packages/nx-plugin).

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). If editing `README`s, conform to [standard-readme](https://github.com/RichardLitt/standard-readme).
