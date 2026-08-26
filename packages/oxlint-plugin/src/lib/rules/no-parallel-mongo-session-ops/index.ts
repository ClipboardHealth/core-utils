/**
 * @fileoverview Rule to disallow parallel operations sharing one MongoDB transaction session.
 *
 * The MongoDB driver documents parallel operations inside a transaction as undefined behaviour.
 * From `startTransaction` and `withTransaction` in the driver's `lib/sessions.js`:
 *
 * > Running operations in parallel is not supported during a transaction. The use of
 * > `Promise.all`, `Promise.allSettled`, `Promise.race`, etc to parallelize operations inside a
 * > transaction is undefined behaviour.
 *
 * In practice one branch aborts the transaction and its siblings, still in flight, fail with
 * `Transaction with { txnNumber: N } has been aborted.`
 *
 * The rule reports a concurrency primitive that reaches a session declared *outside* it, meaning
 * every branch shares one session. A session created *inside* the callback gives each branch its
 * own and is not reported, which is the safe way to fan out.
 *
 * Oxlint JS plugins receive no type information, so a session is recognised by binding name or by
 * `.session` member access rather than by the `ClientSession` type. Bindings are resolved through
 * scope analysis, so same-named sessions in different scopes do not collide.
 *
 * Repositories with their own bounded-concurrency helpers should list them in
 * `additionalPrimitives`; the defaults cover only the `Promise` combinators.
 */
import { defineRule, type ESTree, type Variable } from "@oxlint/plugins";

import { findVariable as findVariableInScope } from "../../internal/findVariable";

const SESSION_NAMES = new Set([
  "session",
  "mongoSession",
  "transactionSession",
  "clientSession",
  "dbSession",
]);

const PROMISE_COMBINATORS = new Set(["all", "allSettled", "race", "any"]);

const TASK_LIST_METHODS = new Set(["map", "flatMap"]);

type Identifier = ESTree.BindingIdentifier | ESTree.IdentifierName | ESTree.IdentifierReference;

interface SessionReference {
  range: readonly number[];
  /** Absent when the session arrives on something we cannot resolve, such as `this.session`. */
  variable: Variable | undefined;
  label: string;
}

interface IdentifierReference {
  range: readonly number[];
  variable: Variable | undefined;
}

function isWithin(inner: readonly number[], outer: readonly number[]): boolean {
  return Number(inner[0]) >= Number(outer[0]) && Number(inner[1]) <= Number(outer[1]);
}

/** A task list is the only initialiser worth following; anything else is unrelated data. */
function isTaskList(init: ESTree.Node | null | undefined): boolean {
  if (!init) {
    return false;
  }

  if (init.type === "ArrayExpression") {
    return true;
  }

  return (
    init.type === "CallExpression" &&
    init.callee.type === "MemberExpression" &&
    !init.callee.computed &&
    init.callee.property.type === "Identifier" &&
    TASK_LIST_METHODS.has(init.callee.property.name)
  );
}

const rule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Disallow parallel operations sharing one MongoDB transaction session",
      url: "https://github.com/ClipboardHealth/core-utils/tree/main/packages/oxlint-plugin/src/lib/rules/no-parallel-mongo-session-ops",
    },
    schema: [
      {
        type: "object",
        properties: {
          additionalPrimitives: {
            type: "array",
            items: { type: "string" },
            description:
              "Names of project-local helpers that run their tasks concurrently, for example a bounded-concurrency wrapper around Promise.all.",
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      parallelSessionOps:
        "`{{ primitive }}` runs its operations in parallel on the `{{ name }}` transaction session, which the MongoDB driver documents as undefined behaviour. Await them sequentially, or give each branch its own session.",
    },
  },
  create(context) {
    const [options] = context.options;
    const additionalPrimitives = new Set<string>(
      (options as { additionalPrimitives?: string[] } | undefined)?.additionalPrimitives ?? [],
    );

    const parallelCalls: Array<{ node: ESTree.CallExpression; primitive: string }> = [];
    const sessionReferences: SessionReference[] = [];
    const identifierReferences: IdentifierReference[] = [];
    const nonReferenceRanges = new Set<string>();
    /** Keyed by resolved binding, so same-named lists in sibling scopes stay distinct. */
    const taskLists = new Map<Variable, ESTree.Node>();

    function resolve(identifier: Identifier): Variable | undefined {
      return findVariableInScope(context.sourceCode, identifier);
    }

    function primitiveName(node: ESTree.CallExpression): string | undefined {
      const { callee } = node;

      if (callee.type === "Identifier" && additionalPrimitives.has(callee.name)) {
        return callee.name;
      }

      if (
        callee.type === "MemberExpression" &&
        !callee.computed &&
        callee.object.type === "Identifier" &&
        callee.object.name === "Promise" &&
        callee.property.type === "Identifier" &&
        PROMISE_COMBINATORS.has(callee.property.name)
      ) {
        return `Promise.${callee.property.name}`;
      }

      return undefined;
    }

    /**
     * A configured helper taking a concurrency of 1 runs one task at a time, so it is already
     * sequential and safe.
     */
    function isSequential(node: ESTree.CallExpression): boolean {
      const { callee } = node;
      if (!(callee.type === "Identifier" && additionalPrimitives.has(callee.name))) {
        return false;
      }

      return node.arguments.some((argument) => "value" in argument && argument.value === 1);
    }

    /** A session is per-branch when its declaration sits inside the primitive itself. */
    function isDeclaredWithin(variable: Variable | undefined, range: readonly number[]): boolean {
      return variable?.identifiers.some((identifier) => isWithin(identifier.range, range)) === true;
    }

    return {
      CallExpression(node) {
        const primitive = primitiveName(node);
        if (primitive !== undefined && !isSequential(node)) {
          parallelCalls.push({ node, primitive });
        }
      },

      // A non-shorthand key, as in `{ session: workplaceId }`, is a label rather than a reference.
      Property(node) {
        if (!("key" in node) || !("shorthand" in node)) {
          return;
        }

        if (!node.shorthand && !node.computed && node.key.type === "Identifier") {
          nonReferenceRanges.add(node.key.range.join(":"));
        }
      },

      // `options.session` and `options?.session` carry the session in on an object.
      MemberExpression(node) {
        if (node.type !== "MemberExpression" || node.computed) {
          return;
        }

        if (node.property.type !== "Identifier") {
          return;
        }

        if (node.property.name === "session") {
          const object = node.object;
          sessionReferences.push({
            range: node.range,
            variable: object.type === "Identifier" ? resolve(object) : undefined,
            label: object.type === "Identifier" ? object.name : "session",
          });
        }

        nonReferenceRanges.add(node.property.range.join(":"));
      },

      Identifier(node) {
        const variable = resolve(node);
        identifierReferences.push({ range: node.range, variable });

        if (SESSION_NAMES.has(node.name)) {
          sessionReferences.push({ range: node.range, variable, label: node.name });
        }
      },

      VariableDeclarator(node) {
        const { id, init } = node;
        if (id.type !== "Identifier" || !isTaskList(init)) {
          return;
        }

        const variable = resolve(id);
        if (variable && init) {
          taskLists.set(variable, init);
        }
      },

      "Program:exit"() {
        for (const { node, primitive } of parallelCalls) {
          const argumentRanges = node.arguments.map((argument) => argument.range);
          const searchRanges: Array<readonly number[]> = [node.range];

          // `const tasks = items.map(...)` before `Promise.all(tasks)` keeps the session out of
          // the call site, so search where the list was built too.
          for (const reference of identifierReferences) {
            if (!argumentRanges.some((range) => isWithin(reference.range, range))) {
              continue;
            }

            const taskList = reference.variable && taskLists.get(reference.variable);
            if (taskList && !isWithin(taskList.range, node.range)) {
              searchRanges.push(taskList.range);
            }
          }

          const shared = sessionReferences.find(
            (reference) =>
              searchRanges.some((range) => isWithin(reference.range, range)) &&
              !nonReferenceRanges.has(reference.range.join(":")) &&
              // Check every searched range, not just the call: a task list built above the call
              // can itself declare a per-branch session inside its callbacks.
              !searchRanges.some((range) => isDeclaredWithin(reference.variable, range)),
          );

          if (shared) {
            context.report({
              node,
              messageId: "parallelSessionOps",
              data: { primitive, name: shared.label },
            });
          }
        }
      },
    };
  },
});

export default rule;
