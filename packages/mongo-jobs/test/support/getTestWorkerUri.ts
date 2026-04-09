/**
 * Generate a unique resource URI (e.g. a database URL) for a parallel test run by Vitest.
 *
 * Vitest runs tests in parallel by spawning worker processes. Each process is assigned
 * an ID (e.g. 1, 2, etc.) which is accessible via the VITEST_POOL_ID environment variable.
 * The parallelization is done on a file level, so "foo.spec.ts" and "bar.spec.ts"
 * are run in parallel.
 *
 * This mechanism can be leveraged to generate a unique resource URI based on a URI template.
 * The template needs to contain the {{test_worker_id}} variable, which will be substituted
 * with the VITEST_POOL_ID environment variable. This will result in a unique and
 * non-conflicting URI for each worker running in parallel.
 *
 * @example
 * ```ts
 * getTestWorkerUri("mongodb://root:mongo@localhost/tests-{{test_worker_id}}?authSource=admin")
 * "mongodb://root:mongo@localhost/tests-1?authSource=admin"
 * ```
 *
 * @param {string} template - The URI string with one or more {{test_worker_id}} variables
 */
export function getTestWorkerUri(template: string): string {
  const trimmedTemplate = template.trim();

  if (trimmedTemplate.length === 0) {
    throw new Error("Argument 'template' representing a string for the URI can't be blank");
  }

  if (!trimmedTemplate.includes("{{test_worker_id}}")) {
    throw new Error("Argument 'template' must include the '{{test_worker_id}}' placeholder");
  }

  const workerId = process.env["VITEST_POOL_ID"];

  if (!workerId) {
    throw new Error("Environment variable 'VITEST_POOL_ID' was not set in the current context");
  }

  return trimmedTemplate.replaceAll("{{test_worker_id}}", workerId);
}
