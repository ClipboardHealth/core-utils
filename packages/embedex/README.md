<h1 align="center">embedex</h1>
<p align="center">
  <img alt="embedex logo." src="./static/logo.png" width=320>
</p>

Command-line interface (CLI) to embed examples into TypeDoc comments.

While you can write code directly in TypeDoc comments using the [`@example` tag](https://typedoc.org/tags/example/), they aren't type-checked, linted, or tested, making it difficult to keep them up to date.

While [`typedoc-plugin-include-example`](https://github.com/ferdodo/typedoc-plugin-include-example) embeds code into the resulting TypeDoc, it's missing from your code so VS Code's on-hover doesn't show the examples.

Ensure your example code runs and shows up in your IDE with `embedex`.

## Table of contents <!-- omit from toc -->

- [Install](#install)
- [Usage](#usage)
- [Reference](#reference)
- [Local development commands](#local-development-commands)

## Install

```sh
npm install -D embedex
```

## Usage

1. Add an example to `./examples` (configurable). The first line is a comma-separated list of paths from the current working directory to embed targets. `./examples/greeter.ts`:

   ```ts
   // src/greeter.ts
   import { greet } from "@my-scope/greeter";

   greet("world");
   ```

1. In embed target files, add an example comment with the path of the example. `./src/greeter.ts`:

   ````ts
   /**
    * Greets a person by name.
    *
    * @example
    * ```ts
    * // examples/greeter.ts
    * ```
    */
   function greet(name: string) {
     console.log(`Hello, ${name}!`);
   }
   ````

1. Run `npx embedex`.
1. The example is embedded! `./src/greeter.ts`:

   ````ts
   /**
    * Greets a person by name.
    *
    * @example
    * ```ts
    * // examples/greeter.ts
    * import { greet } from "@my-scope/greeter";
    *
    * greet("world");
    * ```
    */
   function greet(name: string) {
     console.log(`Hello, ${name}!`);
   }
   ````

## Reference

```
Usage: embedex [options]

Command-line interface (CLI) to embed example TypeScript code into TypeDoc comments.

Options:
  -V, --version               output the version number
  -e, --examples <directory>  examples directory glob pattern (default: "examples/**/*.ts")
  -c, --check                 check if examples are already embedded, useful for CI (default:
                              false)
  -d, --dry-run               show what would be changed without making changes (default: false)
  -h, --help                  display help for command
```

## Local development commands

See [`package.json`](./package.json) `scripts` for a list of commands.
