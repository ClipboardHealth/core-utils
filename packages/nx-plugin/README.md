# @clipboard-health/nx-plugin

Clipboard Health's Nx plugin contains generators to manage libraries within an Nx workspace.

## Table of Contents

- [Table of Contents](#table-of-contents)
- [Install](#install)
- [Usage](#usage)
  - [Adding new libraries](#adding-new-libraries)
  - [Porting existing libraries](#porting-existing-libraries)

## Install

```bash
npm install @clipboard-health/nx-plugin
```

## Usage

### Adding new libraries

Libraries version and publish separately. We use [Nx Local Generators](https://nx.dev/recipes/generators/local-generators) to generate library stubs that successfully build, lint, and test. The `--publishable` flag sets up semantic versioning from commit messages, GitHub Release creation, and NPM publishing on merges to `main` (but only if the code within your library package changed, thanks to Nx's dependency graph).

```bash
# Optionally, include the --publishable flag to publish to NPM.
npx nx generate @clipboard-health/nx-plugin:node-lib [PROJECT_NAME]

# Change your mind? Remove it just as easily...
npx nx generate @nx/workspace:remove --projectName [PROJECT_NAME]

# ...or rename it. Note: after running this command, perform a find/replace for remaining references
# to the old name.
npx nx generate @nx/workspace:move --projectName [PROJECT_NAME] --destination [NEW_PROJECT_NAME]
```

### Porting existing libraries

Follow [Adding new libraries](#adding-new-libraries) to generate a new package and copy the code from the existing library into it.
