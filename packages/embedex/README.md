# embedex <!-- omit from toc -->

Embed shared text and code snippets from source files into destination files. For example, embed TypeScript examples into TypeDoc comments and your README.

`embedex` helps ensure a single source of truth while ensuring sources are up-to-date with the code they are documenting, runnable, linted, tested, and show on hover in IDEs.

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

1. Add a source file to the `./examples` directory (configurable). The first line is a comma-separated list of destination file paths to embed the source's file contents into. `./examples/greeter.ts`:

   ```ts
   // README.md,src/greeter.ts
   import { greet } from "@my-scope/greeter";

   greet("world");
   ```

2. In the destination file, add an `<embedex source="..."></embedex>` tag that includes the source file's path.

   1. `./README.md`:

      ```
      # greeter

      Greets a person by name.

      <embedex source="examples/greeter.ts">
      </embedex>
      ```

   2. `./src/greeter.ts`:

      ```ts
      /**
       * Greets a person by name.
       *
       * @example
       * <embedex source="examples/greeter.ts">
       * </embedex>
       */
      function greet(name: string) {
        console.log(`Hello, ${name}!`);
      }
      ```

3. Run `npx embedex`.
4. The source is embedded! `./src/greeter.ts`:

   1. `./README.md`:

      ````
      # greeter

      Greets a person by name.

      <embedex source="examples/greeter.ts">

      ```ts
      import { greet } from "@my-scope/greeter";

      greet("world");
      ```

      </embedex>
      ````

   2. `./src/greeter.ts`:

      ````ts
      /**
       * Greets a person by name.
       *
       * @example
       * <embedex source="examples/greeter.ts">
       *
       * ```ts
       * import { greet } from "@my-scope/greeter";
       *
       * greet("world");
       * ```
       *
       * </embedex>
       */
      function greet(name: string) {
        console.log(`Hello, ${name}!`);
      }
      ````

## Reference

```
Usage: embedex [options]

Embed shared text and code snippets from source files into destination files.

Options:
  -V, --version                 output the version number
  -e, --sourcesGlob <pattern>   sources glob pattern (default: "examples/**/*.{md,ts}")
  -c, --check                   verify if sources are correctly embedded without making changes,
                                exits with non-zero code if updates are needed; useful for CI/CD
                                pipelines (default: false)
  -v, --verbose                 show verbose output (default: false)
  -h, --help                    display help for command
```

## Local development commands

See [`package.json`](./package.json) `scripts` for a list of commands.
