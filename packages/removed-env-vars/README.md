# @clipboard-health/removed-env-vars <!-- omit from toc -->

CI check that fails when a change stops setting an environment variable in ECS task-definition templates while code still reads it.

Renaming or deleting a variable in a template is a one-line change that looks safe in review. If an installed library still reads the old name, the service deploys without it and fails at runtime. This check compares the templates with the base branch and searches for readers of every removed name.

## Table of contents <!-- omit from toc -->

- [Usage](#usage)
- [What it checks](#what-it-checks)
- [Exceptions](#exceptions)
- [Limits](#limits)

## Usage

Run it after installing dependencies, from the repository root, with the pull request's base commit fetched:

```bash
npx @clipboard-health/removed-env-vars --base "$BASE_SHA"
```

| Option         | Default                                    | Description                                                           |
| -------------- | ------------------------------------------ | --------------------------------------------------------------------- |
| `--base`       | (required)                                 | Git revision the change merges into.                                  |
| `--templates`  | `terraform/templates`                      | Directory of container-definition JSON templates. Repeat for several. |
| `--exceptions` | `.github/removed-env-vars-exceptions.json` | Exceptions file.                                                      |
| `--scope`      | `@clipboard-health`                        | Package scope whose installed code is searched. Repeat for several.   |

It exits 0 on success, 1 when the check fails and 2 on a usage error. In GitHub Actions it writes failures as annotations on the template.

A GitHub Actions job:

```yaml
- uses: actions/checkout@v7
  with:
    fetch-depth: 0
    persist-credentials: false
- run: npm ci
- run: npx @clipboard-health/removed-env-vars --base "${{ github.event.pull_request.base.sha || github.event.merge_group.base_sha }}"
```

## What it checks

1. It collects the `name` of every `environment` and `secrets` entry in the `*.json` templates, at the merge base of the base revision and `HEAD`, and in the working tree. A name is removed when no template sets it any more, so moving a variable between templates, or deleting one service's template while another still sets the name, passes.
2. For each removed name it searches:
   - the repository's tracked JavaScript and TypeScript files, except `*.spec.*` and `*.test.*` files;
   - installed packages in the configured scopes, except those `package-lock.json` marks as development-only.
3. Code reads a name when it uses the name as a whole string literal, such as `process.env["NAME"]` or `getEnv("NAME")`, or as a property: `process.env.NAME`, `const { NAME } = process.env`, or a schema key such as `z.object({ NAME: z.string() })`. Comments don't count.
4. An `@clipboard-health/config` value also reads a name: `createConfig({ config: { myApi: { baseURL: { defaultValue, description } } } })` reads `MY_API_BASE_URL`.

The check only looks at names the change removes, so variables that are already unset never fail it.

## Exceptions

When a reader is unreachable or has a safe fallback, add an entry to the exceptions file in the same pull request:

```json
[
  {
    "name": "LEGACY_API_URL",
    "reason": "Only the retired v1 client reads it, behind a disabled flag.",
    "ticket": "ABC-123",
    "expiresOn": "2027-01-31"
  }
]
```

Every field is required. An expired exception fails the check. An exception that matches no removed variable prints a warning, because it has served its purpose and can be deleted.

## Limits

- It reads JSON templates only, not variables that Terraform, a Dockerfile or the image sets.
- It can't see names built at runtime, such as `process.env[prefix + "_URL"]`.
- Packages outside the configured scopes aren't searched, including those nested inside a scoped package.
