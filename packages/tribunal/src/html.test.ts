import { renderHtmlReport } from "./html.ts";
import type { TribunalResponse } from "./tribunal.ts";

const generatedAt = new Date("2026-05-20T12:34:56.000Z");

const response: TribunalResponse = {
  metadata: {
    estimatedCostUsd: null,
    latencyMs: 4321,
    models: {
      advocate: { modelId: "claude-opus-4-7", provider: "anthropic" },
      analyst: { modelId: "gemini-3.1-pro-preview", provider: "google" },
      deliberator: { modelId: "gpt-5.4", provider: "openai" },
      skeptic: { modelId: "gpt-5.4", provider: "openai" },
    },
    totalUsage: { inputTokens: 1234, outputTokens: 567, totalTokens: 1801 },
    warnings: ["Cost estimate unavailable."],
  },
  perspectives: [
    {
      metadata: {
        latencyMs: 200,
        model: { modelId: "claude-opus-4-7", provider: "anthropic" },
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      },
      result: {
        claims: [
          {
            assumptions: ["Team can ship."],
            claim: "Demand is high.",
            confidence: 0.82,
            reasoning: "Users have explicitly asked for it.",
          },
        ],
        openQuestions: ["Who owns rollout?"],
        role: "advocate",
        summary: "Launch has clear upside.",
      },
      role: "advocate",
    },
    {
      metadata: {
        latencyMs: 150,
        model: { modelId: "gpt-5.4", provider: "openai" },
      },
      result: {
        claims: [
          {
            assumptions: [],
            claim: "Support load may spike.",
            confidence: 0.6,
            reasoning: "Historical analogues show 3x volume.",
          },
        ],
        openQuestions: [],
        role: "skeptic",
        summary: "Risks remain non-trivial.",
      },
      role: "skeptic",
    },
    {
      metadata: {
        latencyMs: 180,
        model: { modelId: "gemini-3.1-pro-preview", provider: "google" },
      },
      result: {
        claims: [
          {
            assumptions: [],
            claim: "Decision hinges on staffing.",
            confidence: 0.5,
            reasoning: "Capacity is the binding constraint.",
          },
        ],
        openQuestions: ["What is the on-call capacity?"],
        role: "analyst",
        summary: "Tradeoffs depend on staffing.",
      },
      role: "analyst",
    },
  ],
  result: {
    answer: "Launch carefully in <phases>.",
    caveats: ["Watch support volume."],
    confidence: 0.72,
    consensus: ["Demand exists."],
    disagreements: ["Risk tolerance differs."],
    keyTakeaways: ["Launch scope matters."],
    openQuestions: ["Who owns rollout?"],
    recommendation: "Launch in phases.",
  },
};

describe("HTML report rendering", () => {
  it("returns a complete HTML document", () => {
    const html = renderHtmlReport({ generatedAt, query: "Should we launch?", response });

    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain("<title>Tribunal — Should we launch?</title>");
    expect(html).toContain("Launch carefully in &lt;phases&gt;.");
    expect(html).toContain("Launch in phases.");
    expect(html).toContain('style="--confidence:72%"');
  });

  it("renders each perspective as a <details> accordion in fixed order", () => {
    const html = renderHtmlReport({ generatedAt, query: "Should we launch?", response });

    const advocateAt = html.indexOf('data-role="advocate"');
    const skepticAt = html.indexOf('data-role="skeptic"');
    const analystAt = html.indexOf('data-role="analyst"');

    expect(advocateAt).toBeGreaterThan(-1);
    expect(skepticAt).toBeGreaterThan(advocateAt);
    expect(analystAt).toBeGreaterThan(skepticAt);
    expect(html.match(/<details class="testimony"/g)).toHaveLength(3);
    expect(html).toContain("Demand is high.");
    expect(html).toContain("Support load may spike.");
    expect(html).toContain("Decision hinges on staffing.");
  });

  it("escapes user-supplied content", () => {
    const html = renderHtmlReport({
      context: "<script>alert('x')</script>",
      generatedAt,
      query: "Inject <script>?",
      response,
    });

    expect(html).toContain("&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert");
  });

  it("renders confidence percentages on claims", () => {
    const html = renderHtmlReport({ generatedAt, query: "Should we launch?", response });

    expect(html).toContain('style="--confidence:82%"');
    expect(html).toContain('style="--confidence:60%"');
    expect(html).toContain('<span class="claim__confidence">82%</span>');
  });
});
