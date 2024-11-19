# embedex <!-- omit from toc -->

A command-line interface (CLI) that embeds examples into TypeDoc comments.

You can write code directly in TypeDoc comments using the [`@example` tag](https://typedoc.org/tags/example/), but keeping them up to date and guaranteed runnable is challenging since they aren't type-checked, linted, or tested.

While [`typedoc-plugin-include-example`](https://github.com/ferdodo/typedoc-plugin-include-example) embeds code into the resulting TypeDoc, the examples aren't in your code, so IDEs cannot show them on hover.

Keep your examples up to date, running, and showing on hover in IDEs with `embedex`.

## Table of contents <!-- omit from toc -->

- [Install](#install)
- [Usage](#usage)
- [Reference](#reference)
- [Local development commands](#local-development-commands)

## Install

Install as a dev dependency in your project:

```sh
npm install --save-dev embedex
```

Or globally:

```sh
npm install --global embedex
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

A command-line interface (CLI) that embeds examples into TypeDoc comments.

Options:
  -V, --version                 output the version number
  -e, --examplesGlob <pattern>  examples glob pattern (default: "examples/**/*.ts")
  -c, --check                   verify if examples are correctly embedded without making changes,
                                exits with non-zero code if updates are needed; useful for CI/CD
                                pipelines (default: false)
  -v, --verbose                 show verbose output (default: false)
  -h, --help                    display help for command
```

## Local development commands

See [`package.json`](./package.json) `scripts` for a list of commands.
