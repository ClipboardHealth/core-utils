/**
 * Generate a unique resource URI (e.g. a database URL) for a parallel test run by Jest.
 *
 * Jest runs tests in parallel by spawning worker processes. Each process is assigned
 * an ID (e.g. 1, 2, etc.) which is accessible via an environment variable JEST_WORKER_ID.
 * The parallelization is done on a file level, so "foo.spec.ts" and "bar.spec.ts"
 * are run in parallel.
 *
 * This mechanism can be leveraged to generate a unique resource URI based on an URI template.
 * The template needs to contain the {{jest_worker_id}} variable which will be substituted
 * with the JEST_WORKER_ID environment variable. This will result in a unique and non-conflicting
 * URI for each worker running in parallel.
 *
 * @example
 * ```ts
 * getJestWorkerUri("mongodb://root:mongo@localhost7/tests-{{jest_worker_id}}?authSource=admin")
 * "mongodb://root:mongo@localhost/tests-1?authSource=admin"
 * ```
 *
 * @param {string} template - The URI string with zero or more {{jest_worker_id}} variables
 */
export function getJestWorkerUri(template: string): string {
  if (!template) {
    throw new Error("Argument 'template' representing a string for the URI can't be blank");
  }

  if (!process.env["JEST_WORKER_ID"]) {
    throw new Error("Environment variable 'JEST_WORKER_ID' was not set in the current context");
  }

  // Case-insensitive substitution to allow the template variable to be in upper case as well
  return template.replaceAll(/{{jest_worker_id}}/gi, process.env["JEST_WORKER_ID"]);
}
