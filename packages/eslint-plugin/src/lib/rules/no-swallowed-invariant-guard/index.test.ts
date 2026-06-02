import { TSESLint } from "@typescript-eslint/utils";

import rule from "./index";

// eslint-disable-next-line n/no-unpublished-require
const parser = require.resolve("@typescript-eslint/parser");

const ruleTester = new TSESLint.RuleTester({
  parser,
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: "module",
  },
});

ruleTester.run("no-swallowed-invariant-guard", rule, {
  valid: [
    {
      name: "rethrows guard failure",
      code: `
        async function updateUser() {
          try {
            await ensureNoConflictingCognitoUser(user);
          } catch (error) {
            throw error;
          }
        }
      `,
    },
    {
      name: "returns caught error",
      code: `
        function updateUser() {
          try {
            assertValidUser(user);
          } catch (error) {
            return error;
          }
        }
      `,
    },
    {
      name: "returns explicit failure value",
      code: `
        function updateUser() {
          try {
            verifyUserCanUpdate(user);
          } catch (error) {
            return failure(error);
          }
        }
      `,
    },
    {
      name: "returns error factory value",
      code: `
        function updateUser() {
          try {
            verifyUserCanUpdate(user);
          } catch (error) {
            return ServiceError.from(error);
          }
        }
      `,
    },
    {
      name: "records invariant violation explicitly",
      code: `
        async function updateUser() {
          try {
            await throwIfIdentifierCollision(user);
          } catch (error) {
            await recordInvariantViolation(error);
            logger.warn("identifier collision", error);
            return { ok: true };
          }
        }
      `,
    },
    {
      name: "ignores swallowed catch without guard call",
      code: `
        function updateUser() {
          try {
            maybeUpdateUser(user);
          } catch (error) {
            logger.warn("optional update failed", error);
          }
        }
      `,
    },
    {
      name: "ignores guard call inside nested function definition",
      code: `
        function updateUser() {
          try {
            const checkUser = () => ensureNoConflictingCognitoUser(user);
            registerCallback(checkUser);
          } catch (error) {
            logger.warn("callback registration failed", error);
          }
        }
      `,
    },
    {
      name: "requires both conditional branches to rethrow",
      code: `
        function updateUser() {
          try {
            validateUser(user);
          } catch (error) {
            if (isServiceError(error)) {
              throw error;
            } else {
              throw new Error("Unexpected guard failure");
            }
          }
        }
      `,
    },
  ],
  invalid: [
    {
      name: "inc-406 shape logs and returns success",
      code: `
        async function updateCognitoUserAttributes() {
          try {
            await ensureNoConflictingCognitoUser(user);
          } catch (error) {
            logger.warn("Cognito conflict check failed during attribute update, skipping update", error);
            return { ok: true };
          }
        }
      `,
      errors: [
        {
          messageId: "swallowedGuard",
          data: { functionName: "ensureNoConflictingCognitoUser" },
        },
      ],
    },
    {
      name: "logs and continues after assert guard failure",
      code: `
        function updateUser() {
          try {
            assertUserCanUpdate(user);
          } catch (error) {
            logger.warn("user update pre-check failed", error);
          }

          updateUserRecord(user);
        }
      `,
      errors: [
        {
          messageId: "swallowedGuard",
          data: { functionName: "assertUserCanUpdate" },
        },
      ],
    },
    {
      name: "returns undefined after member validate guard failure",
      code: `
        function updateUser() {
          try {
            validator.validateUser(user);
          } catch (error) {
            return undefined;
          }
        }
      `,
      errors: [
        {
          messageId: "swallowedGuard",
          data: { functionName: "validateUser" },
        },
      ],
    },
    {
      name: "conditionally rethrows with fallthrough",
      code: `
        function updateUser() {
          try {
            throwIfIdentifierCollision(user);
          } catch (error) {
            if (shouldRethrow(error)) {
              throw error;
            }

            logger.warn("collision check failed", error);
          }
        }
      `,
      errors: [
        {
          messageId: "swallowedGuard",
          data: { functionName: "throwIfIdentifierCollision" },
        },
      ],
    },
    {
      name: "verify guard returns non-error value",
      code: `
        function updateUser() {
          try {
            verifyUserCanUpdate(user);
          } catch (error) {
            return { status: "updated" };
          }
        }
      `,
      errors: [
        {
          messageId: "swallowedGuard",
          data: { functionName: "verifyUserCanUpdate" },
        },
      ],
    },
    {
      name: "returning logger error call still swallows",
      code: `
        function updateUser() {
          try {
            verifyUserCanUpdate(user);
          } catch (error) {
            return logger.error("guard failed", error);
          }
        }
      `,
      errors: [
        {
          messageId: "swallowedGuard",
          data: { functionName: "verifyUserCanUpdate" },
        },
      ],
    },
  ],
});
