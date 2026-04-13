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

ruleTester.run("require-run-validators-with-upsert", rule, {
  valid: [
    {
      name: "upsert: true with runValidators: true",
      code: `Model.findOneAndUpdate(filter, update, { upsert: true, runValidators: true });`,
    },
    {
      name: "upsert: true with runValidators: true and other options",
      code: `Model.findOneAndUpdate(filter, update, { upsert: true, new: true, runValidators: true });`,
    },
    {
      name: "no upsert option",
      code: `Model.findOneAndUpdate(filter, update, { new: true });`,
    },
    {
      name: "upsert: false",
      code: `Model.findOneAndUpdate(filter, update, { upsert: false });`,
    },
    {
      name: "non-target method with upsert: true",
      code: `Model.find(filter, { upsert: true });`,
    },
    {
      name: "runValidators with variable value",
      code: `Model.findOneAndUpdate(filter, update, { upsert: true, runValidators: someFlag });`,
    },
    {
      name: "updateOne with runValidators: true",
      code: `Model.updateOne(filter, update, { upsert: true, runValidators: true });`,
    },
    {
      name: "updateMany with runValidators: true",
      code: `Model.updateMany(filter, update, { upsert: true, runValidators: true });`,
    },
    {
      name: "findByIdAndUpdate with runValidators: true",
      code: `Model.findByIdAndUpdate(id, update, { upsert: true, runValidators: true });`,
    },
    {
      name: "findOneAndReplace with runValidators: true",
      code: `Model.findOneAndReplace(filter, replacement, { upsert: true, runValidators: true });`,
    },
    {
      name: "replaceOne with runValidators: true",
      code: `Model.replaceOne(filter, replacement, { upsert: true, runValidators: true });`,
    },
  ],
  invalid: [
    {
      name: "upsert: true without runValidators",
      code: `Model.findOneAndUpdate(filter, update, { upsert: true });`,
      errors: [{ messageId: "missingRunValidators" }],
    },
    {
      name: "upsert: true with runValidators: false",
      code: `Model.findOneAndUpdate(filter, update, { upsert: true, runValidators: false });`,
      errors: [{ messageId: "runValidatorsFalse" }],
    },
    {
      name: "upsert: true with new: true but no runValidators",
      code: `Model.findOneAndUpdate(filter, update, { upsert: true, new: true });`,
      errors: [{ messageId: "missingRunValidators" }],
    },
    {
      name: "updateOne with upsert: true but no runValidators",
      code: `Model.updateOne(filter, update, { upsert: true });`,
      errors: [{ messageId: "missingRunValidators" }],
    },
    {
      name: "updateMany with upsert: true but no runValidators",
      code: `Model.updateMany(filter, update, { upsert: true });`,
      errors: [{ messageId: "missingRunValidators" }],
    },
    {
      name: "findByIdAndUpdate with upsert: true but no runValidators",
      code: `Model.findByIdAndUpdate(id, update, { upsert: true });`,
      errors: [{ messageId: "missingRunValidators" }],
    },
    {
      name: "findOneAndReplace with upsert: true but no runValidators",
      code: `Model.findOneAndReplace(filter, replacement, { upsert: true });`,
      errors: [{ messageId: "missingRunValidators" }],
    },
    {
      name: "replaceOne with upsert: true but no runValidators",
      code: `Model.replaceOne(filter, replacement, { upsert: true });`,
      errors: [{ messageId: "missingRunValidators" }],
    },
    {
      name: "chained call with upsert: true but no runValidators",
      code: `Model.findOneAndUpdate(filter, update, { upsert: true }).exec();`,
      errors: [{ messageId: "missingRunValidators" }],
    },
    {
      name: "real-world example from codebase",
      code: `TripModel.findOneAndUpdate({ shiftId, workerId }, { $set: { latestWorkerMovement } }, { upsert: true, new: true });`,
      errors: [{ messageId: "missingRunValidators" }],
    },
  ],
});
