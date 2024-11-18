# @clipboard-health/nx-plugin <!-- omit from toc -->

An [Nx](https://nx.dev/) plugin with generators to manage libraries and applications.

## Table of contents <!-- omit from toc -->

- [Install](#install)
- [Usage](#usage)

## Install

```bash
npm install @clipboard-health/nx-plugin
```

## Usage

Libraries version and publish separately. We use [Nx Local Generators](https://nx.dev/recipes/generators/local-generators) to generate library stubs that successfully build, lint, and test. The `--publishPublicly` flag publishes the NPM package publicly.

```bash
# Optionally, include the --publishPublicly flag.
npx nx generate @clipboard-health/nx-plugin:node-lib [PROJECT_NAME]

# Change your mind? Remove it just as easily...
npx nx generate @nx/workspace:remove --projectName [PROJECT_NAME]

# ...or rename it. Note: after running this command, perform a find/replace for remaining references
# to the old name.
npx nx generate @nx/workspace:move --project [PROJECT_NAME] --destination [DESTINATION_FOLDER]
```

To porting an existing library, follow the above to generate a new package and copy the code from the existing library into it.
