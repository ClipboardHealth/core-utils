import { execFileSync } from "node:child_process";
import path from "node:path";

describe("published custom error protocol", () => {
  it("recognizes the real CommonJS and ESM package-root exports in both directions", () => {
    const workspaceRoot = path.resolve(import.meta.dirname, "../../..");
    const script = `
      import assert from "node:assert/strict";
      import { createRequire } from "node:module";
      import { z } from "zod";

      const require = createRequire(import.meta.url);
      const commonjs = require("./dist/packages/contract-core/src/index.js");
      const esm = await import("./dist/packages/contract-core/esm/src/index.js");
      assert.notEqual(commonjs.customError, esm.customError);

      const bodySchema = z.object({ message: z.string() });
      const body = { message: "keep original", extra: true };
      const headers = { "retry-after": "30" };
      for (const [producer, consumer] of [[commonjs, esm], [esm, commonjs]]) {
        const declaration = producer.customError({ status: 422, body: bodySchema });
        assert.equal(consumer.getCustomErrorBodySchema({ schema: declaration.data }), bodySchema);
        const result = await declaration.data["~standard"].validate({ body, headers });
        assert.equal(result.issues, undefined);
        assert.deepEqual(consumer.getCustomErrorResponse({ data: result.value }), { body, headers });
        assert.equal(consumer.getCustomErrorResponse({ data: result.value }).body, body);

        const repeated = await consumer.customError({ status: 422, body: bodySchema })
          .data["~standard"].validate(result.value);
        assert.equal(repeated.issues, undefined);
        assert.equal(producer.getCustomErrorResponse({ data: repeated.value }).body, body);
        assert.equal(consumer.getCustomErrorResponse({ data: { body, headers } }), undefined);
        assert.equal(consumer.getCustomErrorBodySchema({ schema: bodySchema }), undefined);
      }
    `;

    expect(() =>
      execFileSync(process.execPath, ["--input-type=module", "--eval", script], {
        cwd: workspaceRoot,
        stdio: "pipe",
      }),
    ).not.toThrow();
  });
});
