import { RuleTester } from "oxlint/plugins-dev";

import rule from "./index";

RuleTester.describe = (name, run) => {
  describe(name, () => {
    run();
  });
};
RuleTester.it = it;

const ruleTester = new RuleTester({
  eslintCompat: true,
  languageOptions: {
    parserOptions: { lang: "ts" },
    sourceType: "module",
  },
});

/** Mirrors a consumer that registers its own bounded-concurrency helpers. */
const withHelpers = [
  { additionalPrimitives: ["batchPromiseAllWithLimit", "batchPromiseAllSettledWithLimit"] },
];

// oxlint-disable-next-line vitest/expect-expect -- RuleTester validates declaratively
ruleTester.run("no-parallel-mongo-session-ops", rule, {
  valid: [
    {
      name: "no session in play",
      code: "await Promise.all(items.map(async (item) => await handle(item)));",
    },
    {
      name: "sequential loop over a shared session",
      code: "for (const item of items) { await enqueue(item, { session }); }",
    },
    {
      name: "sequential helper over a shared session",
      code: "await forEachAsyncSequentially(items, async (item) => { await enqueue(item, { session }); });",
    },
    {
      name: "each branch opens its own session",
      code: `await Promise.all(
        items.map(async (item) => {
          const session = await mongoose.startSession();
          await enqueue(item, { session });
        }),
      );`,
    },
    {
      name: "each branch opens its own session under a different name",
      code: `await Promise.all(
        items.map(async (item) => {
          const mongoSession = await startMongoSession();
          await enqueue(item, { session: mongoSession });
        }),
      );`,
    },
    {
      name: "a key named session holding something unrelated is a label",
      code: "await Promise.all([updateAddress({ session: workplaceId }), saveNotes()]);",
    },
    {
      name: "sessionUser is not a session",
      code: "await Promise.all(shifts.map(async (shift) => await del(shift, { sessionUser: userId })));",
    },
    {
      name: "sessionId is not a session",
      code: "await Promise.all(files.map(async (file) => await ingest({ sessionId, file })));",
    },
    {
      name: "unrelated verification sessions",
      code: "await Promise.all([getVerificationSessions(id), getDocuments(id)]);",
    },
    {
      name: "a project helper is not a primitive unless configured",
      code: `async function run(session: ClientSession) {
        await batchPromiseAllWithLimit(
          ids.map((id) => async () => await enqueue(id, { session })),
          20,
        );
      }`,
    },
    {
      name: "a configured helper limited to one task at a time is sequential",
      options: withHelpers,
      code: `async function run(session: ClientSession) {
        const deletions = blocks.map((block) => async () => await del(block, session));
        await batchPromiseAllSettledWithLimit(deletions, 1);
      }`,
    },
    {
      name: "a prebuilt task list whose callbacks each open their own session",
      code: `const tasks = items.map(async (item) => {
        const session = await mongoose.startSession();
        await enqueue(item, { session });
      });
      await Promise.all(tasks);`,
    },
    {
      name: "same-named task lists stay distinct, so a session-free call is quiet",
      code: `async function withoutSession(items: Item[]) {
        const promises = items.map(async (item) => await handle(item));
        await Promise.all(promises);
      }
      async function withSessionElsewhere(session: ClientSession, ids: string[]) {
        const other = ids.map(async (id) => await write(id, { session }));
        await forEachAsyncSequentially(other, async (task) => await task);
      }`,
    },
  ],
  invalid: [
    {
      name: "session captured directly in the callback",
      code: `async function run(session: ClientSession) {
        await Promise.all(ids.map(async (id) => await enqueue({ id }, { session })));
      }`,
      errors: [{ messageId: "parallelSessionOps" }],
    },
    {
      name: "session reached only through a task list built above the call",
      code: `async function run(session: ClientSession) {
        const jobsToEnqueue = shifts.flatMap((shift) =>
          Array.from({ length: shift.count }, () => ({ jobData: { shift }, options: { session } })),
        );
        await Promise.all(
          jobsToEnqueue.map(async ({ jobData, options }) => await enqueue(jobData, options)),
        );
      }`,
      errors: [{ messageId: "parallelSessionOps" }],
    },
    {
      name: "task list held in a variable, so the call site names no session",
      code: `async function accept(session: ClientSession) {
        const acceptancePromises = requests.map(async (request) => await handle(request, { session }));
        await Promise.all(acceptancePromises);
      }`,
      errors: [{ messageId: "parallelSessionOps" }],
    },
    {
      name: "configured helper sharing a session",
      options: withHelpers,
      code: `async function run(mongoSession: ClientSession) {
        await batchPromiseAllWithLimit(
          apps.map((app) => async () => await enqueue(app, { session: mongoSession })),
          20,
        );
      }`,
      errors: [{ messageId: "parallelSessionOps" }],
    },
    {
      name: "configured settled helper sharing a session",
      options: withHelpers,
      code: `async function run(session: ClientSession) {
        await batchPromiseAllSettledWithLimit(
          apps.map((app) => async () => await enqueue(app, { session })),
          5,
        );
      }`,
      errors: [{ messageId: "parallelSessionOps" }],
    },
    {
      name: "session destructured from a typed options parameter",
      options: withHelpers,
      code: `async function book(params: Params, { session }: BookOptions) {
        await batchPromiseAllWithLimit(
          shifts.map((shift) => async () => await assignShift({ shift }, { session })),
          concurrency,
        );
      }`,
      errors: [{ messageId: "parallelSessionOps" }],
    },
    {
      name: "session arriving as optional member access",
      options: withHelpers,
      code: `async function cancel(shifts: Shift[], options?: { session?: ClientSession }) {
        await batchPromiseAllWithLimit(
          shifts.map((shift) => async () => await del(shift, { externalSession: options?.session })),
          concurrency,
        );
      }`,
      errors: [{ messageId: "parallelSessionOps" }],
    },
    {
      name: "a callback parameter can receive one shared session, so it stays reportable",
      code: `async function run(shared: ClientSession, ids: string[]) {
        await Promise.all(
          [shared, shared].map(async (session) => await write(ids[0], { session })),
        );
      }`,
      errors: [{ messageId: "parallelSessionOps" }],
    },
    {
      name: "an alias of an outer session inside the callback is not a new session",
      code: `async function run(outerSession: ClientSession, ids: string[]) {
        await Promise.all(
          ids.map(async (id) => {
            const session = outerSession;
            await write(id, { session });
          }),
        );
      }`,
      errors: [{ messageId: "parallelSessionOps" }],
    },
    {
      name: "an IIFE creating one session and returning many operations is not per-branch",
      code: `async function run(ids: string[]) {
        await Promise.all(
          await (async () => {
            const session = await mongoose.startSession();
            return ids.map((id) => write(id, { session }));
          })(),
        );
      }`,
      errors: [{ messageId: "parallelSessionOps" }],
    },
    {
      name: "a flatMap callback runs once per group, so one session there spans many operations",
      code: `async function run(groups: Group[]) {
        await Promise.all(
          groups.flatMap((group) => {
            const session = openSession();
            return group.ids.map((id) => write(id, { session }));
          }),
        );
      }`,
      errors: [{ messageId: "parallelSessionOps" }],
    },
    {
      name: "allSettled shares a session just as all does",
      code: `async function run(session: ClientSession) {
        await Promise.allSettled(ids.map(async (id) => await write(id, { session })));
      }`,
      errors: [{ messageId: "parallelSessionOps" }],
    },
    {
      name: "race shares a session just as all does",
      code: `async function run(session: ClientSession) {
        await Promise.race([writeA({ session }), writeB({ session })]);
      }`,
      errors: [{ messageId: "parallelSessionOps" }],
    },
    {
      name: "only the session-carrying call is reported when task lists share a name",
      code: `async function withoutSession(items: Item[]) {
        const promises = items.map(async (item) => await handle(item));
        await Promise.all(promises);
      }
      async function withSession(session: ClientSession, ids: string[]) {
        const promises = ids.map(async (id) => await write(id, { session }));
        await Promise.all(promises);
      }`,
      errors: [{ messageId: "parallelSessionOps" }],
    },
    {
      name: "declaration order does not hide the finding",
      code: `async function withSession(session: ClientSession, ids: string[]) {
        const promises = ids.map(async (id) => await write(id, { session }));
        await Promise.all(promises);
      }
      async function withoutSession(items: Item[]) {
        const promises = items.map(async (item) => await handle(item));
        await Promise.all(promises);
      }`,
      errors: [{ messageId: "parallelSessionOps" }],
    },
    {
      name: "an inner redeclaration does not mask an outer shared session",
      code: `async function outer(session: ClientSession, ids: string[]) {
        const promises = ids.map(async (id) => await write(id, { session }));
        function inner() {
          const promises = [];
          return promises;
        }
        await Promise.all(promises);
      }`,
      errors: [{ messageId: "parallelSessionOps" }],
    },
  ],
});
