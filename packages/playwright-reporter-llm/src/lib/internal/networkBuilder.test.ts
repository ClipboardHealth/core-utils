import {
  BODIES_CAP,
  DUPLICATE_SAMPLE_STRIDE,
  DUPLICATE_SAMPLE_THRESHOLD,
  GROUPS_CAP,
  INSTANCES_CAP,
} from "./constants";
import {
  hashBody,
  hashShape,
  NetworkBuilder,
  type NetworkObservation,
  type NetworkObservationBody,
  type NetworkObservationInstance,
  type NetworkObservationShape,
} from "./networkBuilder";

function makeObs(
  shape: Partial<NetworkObservationShape> = {},
  instance: Partial<NetworkObservationInstance> = {},
  bodies: { requestBody?: NetworkObservationBody; responseBody?: NetworkObservationBody } = {},
): NetworkObservation {
  return {
    shape: {
      method: "GET",
      url: "https://api.example.com/x",
      status: 200,
      resourceType: "fetch",
      ...shape,
    },
    instance: { offsetMs: 0, ...instance },
    ...bodies,
  };
}

function makeBody(content: string, truncated = false): NetworkObservationBody {
  return { content, contentType: "application/json", truncated, fingerprint: hashBody(content) };
}

function assertInvariants(summary: ReturnType<NetworkBuilder["finalize"]>["summary"]): void {
  expect(
    summary.retainedInstances +
      summary.instancesDroppedByFilter +
      summary.instancesDroppedByGroupCap +
      summary.instancesDroppedByInstanceCap +
      summary.instancesSuppressedAsDuplicate +
      summary.instancesEvictedAfterAdmission,
  ).toBe(summary.observedInstances);
}

describe(hashShape, () => {
  it("returns stable fingerprint for same shape", () => {
    const a = hashShape({
      method: "GET",
      url: "https://x.com/a",
      status: 200,
      resourceType: "fetch",
    });
    const b = hashShape({
      method: "GET",
      url: "https://x.com/a",
      status: 200,
      resourceType: "fetch",
    });
    expect(a).toBe(b);
  });

  it("differs when any field differs", () => {
    const base = { method: "GET", url: "https://x.com/a", status: 200, resourceType: "fetch" };
    expect(hashShape(base)).not.toBe(hashShape({ ...base, method: "POST" }));
    expect(hashShape(base)).not.toBe(hashShape({ ...base, url: "https://x.com/b" }));
    expect(hashShape(base)).not.toBe(hashShape({ ...base, status: 404 }));
    expect(hashShape(base)).not.toBe(hashShape({ ...base, resourceType: "xhr" }));
    expect(hashShape(base)).not.toBe(hashShape({ ...base, failureText: "x" }));
    expect(hashShape(base)).not.toBe(hashShape({ ...base, wasAborted: true }));
  });

  it("does not collide when a delimiter-like character is embedded in a field", () => {
    // Splitting a boundary across two fields must still produce distinct fingerprints — naive
    // concatenation with any single-character delimiter would collide here.
    const status = 200;
    const a = hashShape({ method: "GET", url: 'https://x.com/a","b', status });
    const b = hashShape({ method: 'GET","https://x.com/a', url: "b", status });
    expect(a).not.toBe(b);

    const withPipeInUrl = hashShape({ method: "GET", url: "https://x.com/a||b", status });
    const withPipeInMethod = hashShape({ method: "GET||https://x.com/a", url: "b", status });
    expect(withPipeInUrl).not.toBe(withPipeInMethod);

    const emptyFailureText = hashShape({
      method: "GET",
      url: "https://x.com/a",
      status,
      failureText: "",
    });
    const absentFailureText = hashShape({ method: "GET", url: "https://x.com/a", status });
    expect(emptyFailureText).not.toBe(absentFailureText);
  });
});

describe(NetworkBuilder, () => {
  describe("admission happy path", () => {
    it("admits one observation creating one instance and one group", () => {
      const builder = new NetworkBuilder();
      builder.admit(makeObs({ url: "https://api.example.com/a" }, { offsetMs: 100 }));

      const report = builder.finalize();

      expect(report.instances).toHaveLength(1);
      expect(Object.keys(report.groups)).toHaveLength(1);
      expect(report.instances[0]).toMatchObject({
        id: "n0",
        groupId: "g0",
        method: "GET",
        url: "https://api.example.com/a",
        status: 200,
        offsetMs: 100,
      });
      expect(report.groups["g0"]).toMatchObject({
        id: "g0",
        method: "GET",
        url: "https://api.example.com/a",
        status: 200,
        resourceType: "fetch",
        occurrenceCount: 1,
        retainedInstanceCount: 1,
        suppressedInstanceCount: 0,
        evictedInstanceCount: 0,
        firstOffsetMs: 100,
        lastOffsetMs: 100,
      });
      expect(report.summary.observedInstances).toBe(1);
      expect(report.summary.retainedInstances).toBe(1);
      assertInvariants(report.summary);
    });

    it("reuses group for same shape across observations", () => {
      const builder = new NetworkBuilder();
      builder.admit(makeObs({}, { offsetMs: 100 }));
      builder.admit(makeObs({}, { offsetMs: 200 }));

      const report = builder.finalize();
      expect(Object.keys(report.groups)).toHaveLength(1);
      expect(report.instances).toHaveLength(2);
      expect(report.groups["g0"]?.occurrenceCount).toBe(2);
      expect(report.groups["g0"]?.retainedInstanceCount).toBe(2);
      expect(report.groups["g0"]?.firstOffsetMs).toBe(100);
      expect(report.groups["g0"]?.lastOffsetMs).toBe(200);
      assertInvariants(report.summary);
    });
  });

  describe("filter", () => {
    it("drops low-signal static assets at the filter", () => {
      const builder = new NetworkBuilder();
      builder.admit(makeObs({ resourceType: "script", status: 200 }, { offsetMs: 50 }));
      const report = builder.finalize();

      expect(report.instances).toHaveLength(0);
      expect(Object.keys(report.groups)).toHaveLength(0);
      expect(report.summary.observedInstances).toBe(1);
      expect(report.summary.instancesDroppedByFilter).toBe(1);
      assertInvariants(report.summary);
    });

    it("keeps static assets with 4xx status", () => {
      const builder = new NetworkBuilder();
      builder.admit(makeObs({ resourceType: "script", status: 404 }, { offsetMs: 50 }));
      const report = builder.finalize();

      expect(report.instances).toHaveLength(1);
      expect(report.summary.instancesDroppedByFilter).toBe(0);
    });
  });

  describe("duplicate sampling", () => {
    it("admits first THRESHOLD occurrences unconditionally, then 1-in-STRIDE", () => {
      const builder = new NetworkBuilder();
      for (
        let index = 0;
        index < DUPLICATE_SAMPLE_THRESHOLD + DUPLICATE_SAMPLE_STRIDE * 2;
        index += 1
      ) {
        builder.admit(makeObs({}, { offsetMs: index }));
      }

      const report = builder.finalize();

      expect(report.groups["g0"]?.occurrenceCount).toBe(
        DUPLICATE_SAMPLE_THRESHOLD + DUPLICATE_SAMPLE_STRIDE * 2,
      );
      expect(report.groups["g0"]?.retainedInstanceCount).toBe(DUPLICATE_SAMPLE_THRESHOLD + 2);
      expect(report.groups["g0"]?.suppressedInstanceCount).toBe(DUPLICATE_SAMPLE_STRIDE * 2 - 2);
      expect(report.summary.instancesSuppressedAsDuplicate).toBe(DUPLICATE_SAMPLE_STRIDE * 2 - 2);
      assertInvariants(report.summary);
    });

    it("tracks firstOffsetMs/lastOffsetMs across all post-filter observations including suppressed", () => {
      const builder = new NetworkBuilder();
      for (let index = 0; index < 20; index += 1) {
        builder.admit(makeObs({}, { offsetMs: index * 100 }));
      }

      const report = builder.finalize();
      expect(report.groups["g0"]?.firstOffsetMs).toBe(0);
      expect(report.groups["g0"]?.lastOffsetMs).toBe(19 * 100);
    });
  });

  describe("group cap", () => {
    it("evicts lowest priority group to admit higher priority new shape", () => {
      const builder = new NetworkBuilder();
      for (let index = 0; index < GROUPS_CAP; index += 1) {
        builder.admit(
          makeObs(
            {
              url: `https://cdn.example.com/chunk-${index}.js`,
              resourceType: "script",
              status: 404,
            },
            { offsetMs: index },
          ),
        );
      }

      builder.admit(
        makeObs({ url: "https://api.example.com/error", status: 500 }, { offsetMs: 10_000 }),
      );

      const report = builder.finalize();
      expect(report.summary.retainedGroups).toBe(GROUPS_CAP);
      const serverError = Object.values(report.groups).find((g) => g.status === 500);
      expect(serverError).toBeDefined();
      assertInvariants(report.summary);
    });

    it("rejects new shape when all existing groups are at or above incoming priority", () => {
      const builder = new NetworkBuilder();
      for (let index = 0; index < GROUPS_CAP; index += 1) {
        builder.admit(
          makeObs(
            { url: `https://api.example.com/error-${index}`, status: 500 },
            { offsetMs: index },
          ),
        );
      }
      builder.admit(
        makeObs({ url: "https://api.example.com/ok", status: 200 }, { offsetMs: 10_000 }),
      );

      const report = builder.finalize();
      expect(report.summary.retainedGroups).toBe(GROUPS_CAP);
      expect(report.summary.instancesDroppedByGroupCap).toBe(1);
      assertInvariants(report.summary);
    });

    it("first instance rejected at group cap does not create a zero-instance group", () => {
      const builder = new NetworkBuilder();
      for (let index = 0; index < GROUPS_CAP; index += 1) {
        builder.admit(
          makeObs({ url: `https://api.example.com/e-${index}`, status: 500 }, { offsetMs: index }),
        );
      }
      builder.admit(
        makeObs({ url: "https://api.example.com/x", status: 200 }, { offsetMs: 10_000 }),
      );

      const report = builder.finalize();
      for (const group of Object.values(report.groups)) {
        expect(group.retainedInstanceCount).toBeGreaterThan(0);
      }
    });
  });

  describe("instance cap", () => {
    it("evicts lowest priority instance when instance cap is full", () => {
      const builder = new NetworkBuilder();
      // Fill with 4xx-status client errors (tier 8).
      for (let index = 0; index < INSTANCES_CAP; index += 1) {
        builder.admit(
          makeObs({ url: `https://api.example.com/c-${index}`, status: 400 }, { offsetMs: index }),
        );
      }
      // Admit a 5xx (tier 10) - should evict one of the 4xx.
      builder.admit(
        makeObs({ url: "https://api.example.com/server-err", status: 503 }, { offsetMs: 99_999 }),
      );
      const report = builder.finalize();
      expect(report.instances.length).toBeLessThanOrEqual(INSTANCES_CAP);
      expect(report.summary.instancesEvictedAfterAdmission).toBe(1);
      expect(Object.values(report.groups).some((g) => g.status === 503)).toBe(true);
      assertInvariants(report.summary);
    });

    it("rejects when instance cap is full and all existing match incoming priority", () => {
      // Fill: GROUPS_CAP unique tier-10 shapes, admit 3 of each (below sampling threshold).
      // That produces GROUPS_CAP * 3 admits; the last ones overflow INSTANCES_CAP and get dropped.
      const builder = new NetworkBuilder();
      for (let r = 0; r < 3; r += 1) {
        for (let index = 0; index < GROUPS_CAP; index += 1) {
          builder.admit(
            makeObs(
              { url: `https://api.example.com/e-${index}`, status: 500 },
              { offsetMs: r * 100_000 + index },
            ),
          );
        }
      }
      const report = builder.finalize();
      expect(report.summary.instancesDroppedByInstanceCap).toBe(GROUPS_CAP * 3 - INSTANCES_CAP);
      assertInvariants(report.summary);
    });

    it("removing the last instance of a group deletes the group and frees a groups-cap slot", () => {
      // Fill to GROUPS_CAP unique tier-8 groups (1 instance each), then add tier-10. The tier-8 group
      // loses its only instance to eviction, so a groups-cap slot frees up and the tier-10 fits.
      const builder = new NetworkBuilder();
      for (let index = 0; index < GROUPS_CAP; index += 1) {
        builder.admit(
          makeObs({ url: `https://api.example.com/u-${index}`, status: 400 }, { offsetMs: index }),
        );
      }
      builder.admit(
        makeObs({ url: "https://api.example.com/fresh", status: 503 }, { offsetMs: 99_999 }),
      );

      const report = builder.finalize();
      expect(report.summary.retainedGroups).toBe(GROUPS_CAP);
      expect(
        Object.values(report.groups).some((g) => g.url === "https://api.example.com/fresh"),
      ).toBe(true);
    });
  });

  describe("group eviction cleanup", () => {
    it("clears group statistics when a group is cascade-evicted via group cap", () => {
      // When a group is group-cap evicted, its cascaded instance evictions must be counted
      // on the evicted group's evictedInstanceCount (matching its occurrenceCount) and in the
      // summary's instancesEvictedAfterAdmission — not carried forward as stale metadata on a
      // newly-admitted group with the same URL/status/method by coincidence.
      const builder = new NetworkBuilder();
      const targetShape = { url: "https://api.example.com/target", status: 400 }; // tier 8

      // Admit target enough times to push past the sampling threshold and into stride territory:
      // k=1..3 retained, k=4..12 suppressed, k=13 retained. retained=4, suppressed=9.
      for (let index = 0; index < 13; index += 1) {
        builder.admit(makeObs(targetShape, { offsetMs: index }));
      }

      // Fill groups to capacity with tier-10 shapes, then add one more to force target eviction.
      for (let index = 0; index < GROUPS_CAP; index += 1) {
        builder.admit(
          makeObs(
            { url: `https://api.example.com/hi-${index}`, status: 500 },
            { offsetMs: 10_000 + index },
          ),
        );
      }

      const report = builder.finalize();

      // Target group should no longer be retained.
      expect(Object.values(report.groups).some((g) => g.url === targetShape.url)).toBe(false);

      // All 4 retained target instances should be counted as evicted-after-admission.
      expect(report.summary.instancesEvictedAfterAdmission).toBeGreaterThanOrEqual(4);

      // Summary accounting must still balance — the 13 target observations all land somewhere
      // (retained=0 post-eviction, suppressed=9, evicted=4, plus the filler observations).
      assertInvariants(report.summary);
    });
  });

  describe("bodies", () => {
    it("reuses body id when body hash matches", () => {
      const builder = new NetworkBuilder();
      const body = makeBody("shared-payload");
      builder.admit(
        makeObs({ url: "https://api.example.com/a" }, { offsetMs: 1 }, { requestBody: body }),
      );
      builder.admit(
        makeObs({ url: "https://api.example.com/b" }, { offsetMs: 2 }, { requestBody: body }),
      );

      const report = builder.finalize();
      expect(Object.keys(report.bodies)).toHaveLength(1);
      expect(report.instances[0]?.requestBodyRef).toBe("b0");
      expect(report.instances[1]?.requestBodyRef).toBe("b0");
      assertInvariants(report.summary);
    });

    it("omits body ref when bodies cap is full and body is new", () => {
      const builder = new NetworkBuilder();
      for (let index = 0; index < BODIES_CAP; index += 1) {
        builder.admit(
          makeObs(
            { url: `https://api.example.com/u-${index}` },
            { offsetMs: index },
            { requestBody: makeBody(`body-${index}`) },
          ),
        );
      }
      builder.admit(
        makeObs(
          { url: "https://api.example.com/overflow" },
          { offsetMs: 9999 },
          { requestBody: makeBody("overflow-body") },
        ),
      );

      const report = builder.finalize();
      expect(Object.keys(report.bodies)).toHaveLength(BODIES_CAP);
      expect(report.summary.bodiesOmittedByBodyCap).toBe(1);
      const overflowInstance = report.instances.find(
        (inst) => inst.url === "https://api.example.com/overflow",
      );
      expect(overflowInstance?.requestBodyRef).toBeUndefined();
    });

    it("removes body when refcount hits zero after last referencing instance evicted", () => {
      const builder = new NetworkBuilder();
      const body = makeBody("unique-body");
      // Fill instances cap with tier-8 each unique, one carrying the body.
      builder.admit(
        makeObs(
          { url: "https://api.example.com/with-body", status: 400 },
          { offsetMs: 0 },
          { requestBody: body },
        ),
      );
      for (let index = 1; index < INSTANCES_CAP; index += 1) {
        builder.admit(
          makeObs(
            { url: `https://api.example.com/other-${index}`, status: 400 },
            { offsetMs: index },
          ),
        );
      }
      // Evict the body-carrying instance via a higher-priority admit — because it's the first-offset
      // tier-8 instance with a unique group, the group is also removed (cascade).
      builder.admit(
        makeObs(
          { url: "https://api.example.com/fresh", status: 503 },
          { offsetMs: 99_999 },
          { requestBody: makeBody("fresh-body") },
        ),
      );

      // The original body should be gone, replaced by fresh-body.
      const report = builder.finalize();
      const hasUniqueBody = Object.values(report.bodies).some((b) => b.content === "unique-body");
      expect(hasUniqueBody).toBe(false);
      assertInvariants(report.summary);
    });

    it("counts truncated bodies in summary", () => {
      const builder = new NetworkBuilder();
      builder.admit(
        makeObs(
          { url: "https://api.example.com/a" },
          { offsetMs: 0 },
          { requestBody: makeBody("x".repeat(1000), true) },
        ),
      );
      const report = builder.finalize();
      expect(report.summary.bodiesTruncated).toBe(1);
    });
  });

  describe("finalize ordering", () => {
    it("sorts instances by offsetMs then sequence", () => {
      const builder = new NetworkBuilder();
      builder.admit(makeObs({ url: "https://api.example.com/c" }, { offsetMs: 300 }));
      builder.admit(makeObs({ url: "https://api.example.com/a" }, { offsetMs: 100 }));
      builder.admit(makeObs({ url: "https://api.example.com/b" }, { offsetMs: 200 }));

      const report = builder.finalize();
      expect(report.instances.map((index) => index.url)).toStrictEqual([
        "https://api.example.com/a",
        "https://api.example.com/b",
        "https://api.example.com/c",
      ]);
    });

    it("orders deterministically when offsetMs is absent using insertion sequence", () => {
      const builder = new NetworkBuilder();
      const baseShape = { method: "GET", status: 200, resourceType: "fetch" } as const;
      builder.admit({
        shape: { ...baseShape, url: "https://api.example.com/a" },
        instance: {},
      });
      builder.admit({
        shape: { ...baseShape, url: "https://api.example.com/b" },
        instance: {},
      });
      builder.admit({
        shape: { ...baseShape, url: "https://api.example.com/c" },
        instance: {},
      });

      const report = builder.finalize();
      expect(report.instances.map((index) => index.url)).toStrictEqual([
        "https://api.example.com/a",
        "https://api.example.com/b",
        "https://api.example.com/c",
      ]);
    });
  });

  describe("redirect linking", () => {
    it("links redirect chain by id via URL match", () => {
      const builder = new NetworkBuilder();
      builder.admit(
        makeObs(
          { url: "https://app.example.com/start", status: 302 },
          { offsetMs: 10, redirectToUrl: "https://app.example.com/final" },
        ),
      );
      builder.admit(
        makeObs({ url: "https://app.example.com/final", status: 200 }, { offsetMs: 20 }),
      );

      const report = builder.finalize();
      const start = report.instances.find((index) => index.url === "https://app.example.com/start");
      const final = report.instances.find((index) => index.url === "https://app.example.com/final");
      expect(start?.redirectToId).toBe(final?.id);
      expect(final?.redirectFromId).toBe(start?.id);
    });

    it("does not link a redirect backward to an earlier same-URL instance", () => {
      // Same URL is fetched first, then a later request 302-redirects to it. The redirect target
      // must be a LATER instance, not the earlier one.
      const builder = new NetworkBuilder();
      builder.admit(
        makeObs({ url: "https://app.example.com/final", status: 200 }, { offsetMs: 5 }),
      );
      builder.admit(
        makeObs(
          { url: "https://app.example.com/start", status: 302 },
          { offsetMs: 10, redirectToUrl: "https://app.example.com/final" },
        ),
      );
      builder.admit(
        makeObs({ url: "https://app.example.com/final", status: 200 }, { offsetMs: 20 }),
      );

      const report = builder.finalize();
      const start = report.instances.find(
        (instance) => instance.url === "https://app.example.com/start",
      );
      // instances are sorted by offsetMs in finalize, so finals[0] is the earlier, finals[1] the later.
      const finals = report.instances.filter(
        (instance) => instance.url === "https://app.example.com/final",
      );
      const [earlierFinal, laterFinal] = finals;

      expect(finals).toHaveLength(2);
      expect(earlierFinal?.offsetMs).toBe(5);
      expect(laterFinal?.offsetMs).toBe(20);
      expect(start?.redirectToId).toBe(laterFinal?.id);
      expect(laterFinal?.redirectFromId).toBe(start?.id);
      expect(earlierFinal?.redirectFromId).toBeUndefined();
    });

    it("links in temporal order even when admission order is out of order", () => {
      // Simulates multi-trace merging: the redirect target is admitted BEFORE the redirect
      // source in admission/insertion order, but its offsetMs is LATER. Pre-fix code walked
      // insertion order and missed the target; fix sorts by offsetMs+sequence first.
      const builder = new NetworkBuilder();
      // Admit the target first (insertion-order index 0), but give it the later offsetMs.
      builder.admit(
        makeObs({ url: "https://app.example.com/final", status: 200 }, { offsetMs: 500 }),
      );
      // Admit the redirect source second (insertion-order index 1), with the earlier offsetMs.
      builder.admit(
        makeObs(
          { url: "https://app.example.com/start", status: 302 },
          { offsetMs: 100, redirectToUrl: "https://app.example.com/final" },
        ),
      );

      const report = builder.finalize();
      const start = report.instances.find(
        (instance) => instance.url === "https://app.example.com/start",
      );
      const final = report.instances.find(
        (instance) => instance.url === "https://app.example.com/final",
      );
      expect(start?.redirectToId).toBe(final?.id);
      expect(final?.redirectFromId).toBe(start?.id);
    });
  });

  describe("group-cap eviction tiebreak", () => {
    it("evicts the group with the oldest first-offset when priority ties", () => {
      // Regression for pre-finalize reads of group.firstOffsetMs (which is only populated during
      // finalize). That bug silently fell back to Map-insertion order. To catch it, the group
      // with the smallest firstOffsetMs must be inserted AFTER the first group — otherwise
      // insertion order and offset order agree and the bug passes the test.
      const builder = new NetworkBuilder();

      // First-inserted group: middle-of-the-pack offset (would be evicted under the insertion-
      // order bug because Map iteration yields it first among tied-priority groups).
      builder.admit(
        makeObs({ url: "https://api.example.com/first-inserted", status: 400 }, { offsetMs: 500 }),
      );
      // Second-inserted group: smallest offset. Correct eviction should pick this one.
      const oldestByOffsetUrl = "https://api.example.com/oldest-by-offset";
      builder.admit(makeObs({ url: oldestByOffsetUrl, status: 400 }, { offsetMs: 1 }));
      // Fill the remainder with larger offsets so the two candidates above dominate the tiebreak.
      for (let index = 2; index < GROUPS_CAP; index += 1) {
        builder.admit(
          makeObs(
            { url: `https://api.example.com/filler-${index}`, status: 400 },
            { offsetMs: 10_000 + index },
          ),
        );
      }

      builder.admit(
        makeObs({ url: "https://api.example.com/winner", status: 500 }, { offsetMs: 999_999 }),
      );

      const report = builder.finalize();
      expect(Object.values(report.groups).some((g) => g.url === oldestByOffsetUrl)).toBe(false);
      expect(
        Object.values(report.groups).some(
          (g) => g.url === "https://api.example.com/first-inserted",
        ),
      ).toBe(true);
      expect(
        Object.values(report.groups).some((g) => g.url === "https://api.example.com/winner"),
      ).toBe(true);
    });
  });

  describe("accounting invariants", () => {
    it("holds after mixed admissions, suppressions, evictions, and filter drops", () => {
      const builder = new NetworkBuilder();
      for (let index = 0; index < 50; index += 1) {
        builder.admit(makeObs({ resourceType: "script", status: 200 }, { offsetMs: index }));
      }
      for (let index = 0; index < 20; index += 1) {
        builder.admit(makeObs({}, { offsetMs: 1000 + index }));
      }
      for (let index = 0; index < 5; index += 1) {
        builder.admit(
          makeObs(
            { url: `https://api.example.com/e-${index}`, status: 500 },
            { offsetMs: 2000 + index },
          ),
        );
      }
      const report = builder.finalize();
      expect(report.summary.observedInstances).toBe(75);
      assertInvariants(report.summary);
    });
  });
});
