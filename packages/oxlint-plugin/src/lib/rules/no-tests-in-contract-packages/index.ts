/**
 * @fileoverview Forbid test files in contract packages. The owning service's service tests cover
 * contract behavior by exercising the contract through real handlers.
 */
import { defineRule } from "@oxlint/plugins";

const TEST_FILE_PATTERN = /\.(?:spec|test)\.[cm]?[jt]sx?$/;
const CONTRACT_PACKAGE_DIRECTORY_PREFIX = "contract-";
// A shared schema-helper library rather than a service contract, so it owns its unit tests.
const SHARED_CONTRACT_PACKAGE_DIRECTORY = "contract-core";

/**
 * Returns the directory name under the innermost `packages/` segment of `filename`, so a
 * repository checked out under a directory named `packages/contract-*` doesn't mark its own
 * workspace packages as contract packages.
 */
function workspacePackageDirectory(filename: string): string | undefined {
  const segments = filename.split(/[/\\]/);
  // The last segment is the file name, so a package directory needs at least one segment after it.
  const index = segments.findLastIndex(
    (segment, segmentIndex) => segment === "packages" && segmentIndex < segments.length - 2,
  );
  return index === -1 ? undefined : segments[index + 1];
}

function isInContractPackage(filename: string): boolean {
  const directory = workspacePackageDirectory(filename);
  return (
    directory !== undefined &&
    directory.startsWith(CONTRACT_PACKAGE_DIRECTORY_PREFIX) &&
    directory !== SHARED_CONTRACT_PACKAGE_DIRECTORY
  );
}

const rule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid test files in contract packages; the owning service's service tests cover contract behavior",
      url: "https://github.com/ClipboardHealth/core-utils/tree/main/packages/eslint-plugin/src/lib/rules/no-tests-in-contract-packages",
    },
    schema: [],
    messages: {
      noTestsInContractPackage:
        "Contract packages must not contain test files. The owning service's service tests cover contract behavior through its real handlers; move these assertions into those service tests and delete this file.",
    },
  },
  create(context) {
    // `filename` requires ESLint >=8.40; keep the fallback for older ESLint 8 hosts.
    const filename = context.filename || context.getFilename();
    if (!TEST_FILE_PATTERN.test(filename) || !isInContractPackage(filename)) {
      return {};
    }

    return {
      Program(node) {
        context.report({ node, messageId: "noTestsInContractPackage" });
      },
    };
  },
});

export default rule;
