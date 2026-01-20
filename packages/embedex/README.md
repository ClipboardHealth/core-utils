# embedex <!-- omit from toc -->

Embed shared text and code snippets from source files into destination files that appear on hover in IDEs. For example:

- Embed TypeScript examples into TypeDoc comments and your README.
- Embed a Markdown snippet into multiple JSDoc comments.

`embedex` helps ensure a single source of truth while keeping sources runnable, linted, tested, and up-to-date with the code they are documenting.

## Table of contents <!-- omit from toc -->

- [Install](#install)
- [Usage](#usage)
- [CLI reference](#cli-reference)
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
   // embedex: README.md,src/greeter.ts
   import { greet } from "@my-scope/greeter";

   greet("world");
   ```

2. In the destination file, add an `<embedex source="..."></embedex>` tag that includes the source file's path.
   - `./README.md`:

     ```markdown
     # greeter

     Greets a person by name.

     <embedex source="examples/greeter.ts">
     </embedex>
     ```

   - `./src/greeter.ts`:

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
4. The source is embedded!
   - `./README.md`:

     ````markdown
     # greeter

     Greets a person by name.

     <embedex source="examples/greeter.ts">

     ```ts
     import { greet } from "@my-scope/greeter";

     greet("world");
     ```

     </embedex>
     ````

   - `./src/greeter.ts`:

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

## CLI reference

```text
Usage: embedex [options]

Embed shared text and code snippets from source files into destination files.

Options:
  -V, --version                output the version number
  -s, --sourcesGlob <pattern>  sources glob pattern (default: "examples/**/*.{md,ts}")
  -c, --check                  verify if sources are correctly embedded without making changes,
                               exits with non-zero code if updates are needed; useful for CI/CD
                               pipelines (default: false)
  -v, --verbose                show verbose output (default: false)
  -h, --help                   display help for command
```

## Local development commands

See [`package.json`](./package.json) `scripts` for a list of commands.
