<h1 align="center">core-utils</h1>
<p align="center">
  <a href="https://www.clipboardhealth.com/"><img alt="Clipboard Health logo." src="./static/logo.png"></a>
</p>

Clipboard Health's core libraries and utilities. See individual package `README`s for specific library details.

## Table of contents <!-- omit from toc -->

- [Libraries](#libraries)
- [Local development commands](#local-development-commands)
- [Adding or porting libraries](#adding-or-porting-libraries)
- [Contributing](#contributing)

## Libraries

<!-- START: Auto-generated by ./populateLibraries.ts -->

- [config](./packages/config/README.md): Type-safe static configuration management: a pure function to resolve, validate against a Zod schema, and freeze configuration values.
- [contract-core](./packages/contract-core/README.md): Shared Zod schemas for Clipboard Health's contracts.
- [eslint-config](./packages/eslint-config/README.md): Our ESLint configuration.
- [example-nestjs](./packages/example-nestjs/README.md): A NestJS application using our libraries, primarily for end-to-end testing.
- [json-api](./packages/json-api/README.md): TypeScript-friendly utilities for adhering to the JSON:API specification.
- [json-api-nestjs](./packages/json-api-nestjs/README.md): TypeScript-friendly utilities for adhering to the JSON:API specification with NestJS.
- [nx-plugin](./packages/nx-plugin/README.md): An Nx plugin with generators to manage libraries and applications.
- [rules-engine](./packages/rules-engine/README.md): A pure functional rules engine to keep logic-dense code simple, reliable, understandable, and explainable.
- [testing-core](./packages/testing-core/README.md): TypeScript-friendly testing utilities.
- [util-typescript](./packages/util-typescript/README.md):

<!-- END: Auto-generated by ./populateLibraries.ts -->

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
