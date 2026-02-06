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

ruleTester.run("prefer-array-methods", rule, {
  valid: [
    /**
     * Allow "for loops" when there is a break in control flow (break, return, continue)
     * Technically, continue can be implemented easily with array functions, but in some situations
     * it may be burdensome to do so, so we will allow those to be valid.
     */
    {
      name: "for...of with break",
      code: `for (const item of items) { if (item.done) break; process(item); }`,
    },
    {
      name: "traditional for with break",
      code: `for (let i = 0; i < items.length; i++) { if (items[i].done) break; }`,
    },
    {
      name: "for...of with return",
      code: `for (const item of items) { if (item.found) return item; }`,
    },
    {
      name: "traditional for with return",
      code: `for (let i = 0; i < items.length; i++) { if (items[i].found) return items[i]; }`,
    },
    {
      name: "for...of with continue",
      code: `for (const item of items) { if (!item.valid) continue; process(item); }`,
    },
    {
      name: "traditional for with continue",
      code: `for (let i = 0; i < items.length; i++) { if (!items[i].valid) continue; process(items[i]); }`,
    },
    {
      name: "traditional for loop with return inside switch statement",
      code: `for (let i = 0; i < items.length; i++) { switch (items[i].type) { case 'a': process(items[i]); return; } }`,
    },
    {
      name: "for...of loop with return inside switch statement",
      code: `for (const item of items) { switch (item.type) { case 'a': process(item); return; } }`,
    },

    /**
     * The following case are more defensive in the case of refactors, ensuring that more
     * complicated and edge case behavior still functions
     */

    {
      name: "outer break with nested arrow function return",
      code: `for (const item of items) { items.map(x => { return x; }); if (item.done) break; }`,
    },
    {
      name: "outer continue with nested function expression",
      code: `for (const item of items) { callback(function() { return 42; }); if (!item.valid) continue; }`,
    },
    {
      name: "deeply nested break is valid",
      code: `for (const item of items) { if (a) { if (b) { if (c) { break; } } } }`,
    },
    {
      name: "multiple control flow statements",
      code: `for (const item of items) { if (item.skip) continue; if (item.done) break; process(item); }`,
    },
    {
      name: "nested for loops where inner loop has return exits all loops",
      code: `for (const outer of items) { for (const inner of outer.children) { if (inner.done) return inner; } }`,
    },
  ],
  invalid: [
    /**
     * Forbid "for loops" when there is no break in control flow of the outer loop (break, return, continue)
     * Give a specific message in the case of async functions (since await in array methods does not work).
     */

    {
      name: "for...of loop without control flow break",
      code: `for (const item of items) { process(item); }`,
      errors: [{ messageId: "preferArrayMethods" }],
    },
    {
      name: "traditional for loop without control flow break",
      code: `for (let i = 0; i < items.length; i++) { process(items[i]); }`,
      errors: [{ messageId: "preferArrayMethods" }],
    },
    {
      name: "async for...of loop without control flow",
      code: `async function test() { for (const item of items) { await process(item); } }`,
      errors: [{ messageId: "awaitInLoop" }],
    },
    {
      name: "async traditional for loop without control flow",
      code: `async function test() { for (let i = 0; i < items.length; i++) { await process(items[i]); } }`,
      errors: [{ messageId: "awaitInLoop" }],
    },

    {
      name: "for...of loop with nested return in a function expression",
      code: `for (const item of items) { items.map(x => { if (x.done) return; }); }`,
      errors: [{ messageId: "preferArrayMethods" }],
    },
    {
      name: "traditional for loop with nested return in a function expression",
      code: `for (let i = 0; i < items.length; i++) { items[i].map(x => { if (x.done) return; }); }`,
      errors: [{ messageId: "preferArrayMethods" }],
    },
    {
      name: "for...of loop with nested callback return",
      code: `for (const item of items) { callback(function() { return 42; }); }`,
      errors: [{ messageId: "preferArrayMethods" }],
    },
    {
      name: "traditional for loop with break inside switch statement",
      code: `for (let i = 0; i < items.length; i++) { switch (items[i].type) { case 'a': process(items[i]); break; } }`,
      errors: [{ messageId: "preferArrayMethods" }],
    },
    {
      name: "for...of loop with break inside switch statement",
      code: `for (const item of items) { switch (item.type) { case 'a': process(item); break; } }`,
      errors: [{ messageId: "preferArrayMethods" }],
    },
    {
      name: "traditional for loop with continue inside switch statement",
      code: `for (let i = 0; i < items.length; i++) { switch (items[i].type) { case 'a': process(items[i]); continue; } }`,
      errors: [{ messageId: "preferArrayMethods" }],
    },
    {
      name: "for...of loop with continue inside switch statement",
      code: `for (const item of items) { switch (item.type) { case 'a': process(item); continue; } }`,
      errors: [{ messageId: "preferArrayMethods" }],
    },

    /**
     * The following case are more defensive in the case of refactors, ensuring that more
     * complicated and edge case behavior still functions
     */
    {
      name: "nested for...of loops where inner loop has a break",
      code: `for (const outer of items) { for (const inner of outer.children) { if (inner.done) break; } }`,
      errors: [{ messageId: "preferArrayMethods" }],
    },
    {
      name: "await inside nested function does not trigger await message",
      code: `for (const item of items) { items.map(async x => { await process(x); }); }`,
      errors: [{ messageId: "preferArrayMethods" }],
    },
    {
      name: "await in nested expression without control flow",
      code: `async function test() { for (const item of items) { const result = await fetch(item.url); log(result); } }`,
      errors: [{ messageId: "awaitInLoop" }],
    },
  ],
});
