// cspell:words Fraunces Newsreader opsz wght onum liga lede Csvg Crect
import { formatModelSpec, type ModelRole, type ModelSpec } from "./models.ts";
import type { Role } from "./schemas.ts";
import type { PerspectiveOutput, TribunalResponse } from "./tribunal.ts";

export interface RenderHtmlReportInput {
  response: TribunalResponse;
  query: string;
  context?: string;
  generatedAt: Date;
}

interface RoleAccent {
  label: string;
  description: string;
}

const ROLE_ACCENTS: Record<Role, RoleAccent> = {
  advocate: { label: "For", description: "Strongest reasonable case in favor." },
  skeptic: { label: "Against", description: "Strongest reasonable case against." },
  analyst: { label: "Neutral", description: "Decision space, tradeoffs, dependencies." },
};

const ROLE_ORDER: readonly Role[] = ["advocate", "skeptic", "analyst"];

const REPORT_STYLES = `
:root {
  --paper: #F4EFE4;
  --paper-dim: #EAE2D0;
  --paper-edge: #E0D7C2;
  --ink: #1A1614;
  --ink-soft: #5C534B;
  --ink-faint: #8B7F73;
  --rule: #1A1614;
  --accent: #7E1A2C;
  --advocate: #3D5A3D;
  --skeptic: #7E1A2C;
  --analyst: #1E3A52;
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  background:
    radial-gradient(ellipse 80% 60% at 50% 0%, rgba(126, 26, 44, 0.05), transparent 70%),
    radial-gradient(ellipse 60% 40% at 50% 100%, rgba(30, 58, 82, 0.04), transparent 70%),
    var(--paper);
  background-attachment: fixed;
  color: var(--ink);
}

body {
  font-family: 'Newsreader', Georgia, serif;
  font-size: 18px;
  line-height: 1.55;
  font-feature-settings: "onum" 1, "kern" 1, "liga" 1;
  font-optical-sizing: auto;
  -webkit-font-smoothing: antialiased;
}

body::before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.05 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  opacity: 0.6;
  z-index: 0;
  mix-blend-mode: multiply;
}

.report {
  max-width: 940px;
  margin: 0 auto;
  padding: 56px 56px 96px;
  position: relative;
  z-index: 1;
}

/* MASTHEAD */
.masthead {
  border-top: 4px double var(--rule);
  border-bottom: 4px double var(--rule);
  padding: 18px 0 26px;
  margin-bottom: 56px;
  text-align: center;
}

.masthead__top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  color: var(--ink-soft);
  margin-bottom: 18px;
}

.masthead__title {
  font-family: 'Fraunces', serif;
  font-variation-settings: "opsz" 144, "SOFT" 60, "wght" 700;
  font-size: clamp(86px, 14vw, 168px);
  line-height: 0.82;
  letter-spacing: -0.045em;
  margin: 0;
  text-transform: uppercase;
}

.masthead__subtitle {
  font-family: 'Newsreader', serif;
  font-style: italic;
  font-size: 17px;
  margin: 18px auto 0;
  color: var(--ink-soft);
  max-width: 56ch;
}

/* SHARED */
.section-label {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11px;
  letter-spacing: 0.26em;
  text-transform: uppercase;
  color: var(--accent);
  border-top: 2px solid var(--ink);
  padding-top: 10px;
  align-self: start;
}

/* QUESTION */
.question {
  margin: 0 0 72px;
  display: grid;
  grid-template-columns: 160px 1fr;
  gap: 36px;
}

.question__text {
  font-family: 'Fraunces', serif;
  font-variation-settings: "opsz" 60, "SOFT" 50, "wght" 500;
  font-size: clamp(28px, 3.6vw, 42px);
  line-height: 1.12;
  margin: 0;
  letter-spacing: -0.018em;
}

.question__context {
  margin-top: 22px;
  font-size: 16px;
  color: var(--ink-soft);
  font-style: italic;
  border-left: 2px solid var(--rule);
  padding-left: 16px;
  white-space: pre-wrap;
}

/* VERDICT */
.verdict {
  margin: 0 0 32px;
}

.verdict__grid {
  display: grid;
  grid-template-columns: 160px 1fr;
  gap: 36px;
}

.verdict__answer {
  font-family: 'Newsreader', serif;
  font-size: 21px;
  line-height: 1.55;
  margin: 0;
}

.verdict__answer::first-letter {
  font-family: 'Fraunces', serif;
  font-variation-settings: "opsz" 144, "SOFT" 70, "wght" 700;
  font-size: 84px;
  line-height: 0.84;
  float: left;
  margin: 8px 14px -4px 0;
  color: var(--accent);
}

.recommendation {
  background: var(--paper-dim);
  border-left: 6px solid var(--accent);
  padding: 28px 32px;
  margin-top: 32px;
  position: relative;
}

.recommendation::after {
  content: "§";
  position: absolute;
  right: 24px;
  top: 22px;
  font-family: 'Fraunces', serif;
  font-style: italic;
  font-size: 32px;
  color: var(--accent);
  opacity: 0.35;
}

.recommendation__label {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11px;
  letter-spacing: 0.26em;
  text-transform: uppercase;
  color: var(--accent);
  margin-bottom: 10px;
}

.recommendation__text {
  font-family: 'Fraunces', serif;
  font-variation-settings: "opsz" 60, "SOFT" 30, "wght" 600;
  font-size: clamp(20px, 2.4vw, 28px);
  line-height: 1.25;
  margin: 0;
  letter-spacing: -0.012em;
}

/* CONFIDENCE */
.confidence {
  display: grid;
  grid-template-columns: 160px 1fr auto;
  gap: 36px;
  align-items: center;
  margin: 36px 0 0;
  padding: 22px 0;
  border-top: 1px solid var(--ink);
  border-bottom: 1px solid var(--ink);
}

.confidence__bar {
  height: 14px;
  background: repeating-linear-gradient(90deg, var(--paper-edge) 0 2px, transparent 2px 8px);
  position: relative;
  border: 1px solid var(--ink);
}

.confidence__bar::after {
  content: "";
  position: absolute;
  inset: 0;
  width: var(--confidence, 0%);
  background: var(--accent);
  transition: width 700ms cubic-bezier(0.22, 1, 0.36, 1);
}

.confidence__value {
  font-family: 'Fraunces', serif;
  font-variation-settings: "opsz" 60, "wght" 700;
  font-size: 28px;
  color: var(--accent);
  letter-spacing: -0.02em;
}

/* KEY TAKEAWAYS */
.takeaways {
  display: grid;
  grid-template-columns: 160px 1fr;
  gap: 36px;
  margin: 56px 0;
}

.takeaways__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 18px;
  counter-reset: takeaway;
}

.takeaways__list li {
  counter-increment: takeaway;
  position: relative;
  padding-left: 64px;
  font-family: 'Newsreader', serif;
  font-size: 19px;
  line-height: 1.5;
  min-height: 36px;
}

.takeaways__list li::before {
  content: counter(takeaway, decimal-leading-zero);
  position: absolute;
  left: 0;
  top: -4px;
  font-family: 'Fraunces', serif;
  font-variation-settings: "opsz" 36, "SOFT" 50, "wght" 700;
  font-size: 30px;
  color: var(--accent);
  line-height: 1;
}

/* SPLIT */
.split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 56px;
  margin: 48px 0;
  border-top: 1px solid var(--ink);
  padding-top: 28px;
}

.split__col h3 {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11px;
  letter-spacing: 0.26em;
  text-transform: uppercase;
  margin: 0 0 18px;
  color: var(--accent);
}

.split__col ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 14px;
}

.split__col li {
  padding-left: 22px;
  position: relative;
  font-size: 17px;
  line-height: 1.5;
}

.split__col li::before {
  content: "";
  position: absolute;
  left: 0;
  top: 12px;
  width: 14px;
  height: 1px;
  background: var(--ink);
}

.split__empty {
  font-style: italic;
  color: var(--ink-faint);
  margin: 0;
}

/* TESTIMONIES */
.testimonies {
  margin: 88px 0 64px;
  padding-top: 30px;
  border-top: 4px double var(--rule);
}

.testimonies__title {
  font-family: 'Fraunces', serif;
  font-variation-settings: "opsz" 96, "SOFT" 60, "wght" 700;
  font-size: clamp(48px, 7.6vw, 84px);
  line-height: 0.9;
  margin: 0 0 14px;
  letter-spacing: -0.035em;
  text-transform: uppercase;
}

.testimonies__lede {
  font-family: 'Newsreader', serif;
  font-style: italic;
  font-size: 18px;
  color: var(--ink-soft);
  margin: 0 0 36px;
  max-width: 56ch;
}

.testimony {
  --role: var(--ink);
  border-top: 1px solid var(--ink);
}

.testimony:last-of-type { border-bottom: 1px solid var(--ink); }

.testimony[data-role="advocate"] { --role: var(--advocate); }
.testimony[data-role="skeptic"] { --role: var(--skeptic); }
.testimony[data-role="analyst"] { --role: var(--analyst); }

.testimony summary {
  list-style: none;
  cursor: pointer;
  padding: 26px 0;
  display: grid;
  grid-template-columns: 70px 1fr auto;
  align-items: baseline;
  gap: 26px;
  position: relative;
  transition: background 240ms ease;
}

.testimony summary:hover { background: linear-gradient(90deg, transparent, var(--paper-dim) 30%, var(--paper-dim) 70%, transparent); }
.testimony summary::-webkit-details-marker { display: none; }
.testimony summary::marker { display: none; content: ""; }

.testimony__index {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 13px;
  letter-spacing: 0.18em;
  color: var(--role);
  font-weight: 700;
  align-self: center;
}

.testimony__role {
  font-family: 'Fraunces', serif;
  font-variation-settings: "opsz" 72, "SOFT" 40, "wght" 600;
  font-size: clamp(28px, 4vw, 44px);
  text-transform: uppercase;
  line-height: 1;
  letter-spacing: -0.025em;
  color: var(--role);
  display: block;
}

.testimony__tagline {
  display: block;
  margin-top: 6px;
  font-family: 'Newsreader', serif;
  font-style: italic;
  font-size: 15px;
  color: var(--ink-soft);
}

.testimony__chevron {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11px;
  letter-spacing: 0.22em;
  color: var(--ink-soft);
  text-transform: uppercase;
  display: inline-flex;
  gap: 14px;
  align-items: center;
  align-self: center;
}

.testimony__chevron::after {
  content: "+";
  font-family: 'Fraunces', serif;
  font-variation-settings: "opsz" 36, "wght" 500;
  font-size: 28px;
  line-height: 0;
  width: 36px;
  height: 36px;
  border: 1px solid var(--role);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: transform 280ms ease, background 280ms ease, color 280ms ease;
  color: var(--role);
  padding-bottom: 4px;
}

.testimony[open] .testimony__chevron span { opacity: 0.5; }
.testimony[open] .testimony__chevron::after {
  content: "−";
  background: var(--role);
  color: var(--paper);
}

.testimony__body {
  padding: 6px 0 40px 96px;
  display: grid;
  gap: 30px;
  animation: revealTestimony 420ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes revealTestimony {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: none; }
}

.testimony__summary {
  font-family: 'Fraunces', serif;
  font-variation-settings: "opsz" 36, "SOFT" 30, "wght" 400;
  font-style: italic;
  font-size: 22px;
  line-height: 1.4;
  margin: 0;
  border-left: 3px solid var(--role);
  padding-left: 22px;
}

.testimony__heading {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11px;
  letter-spacing: 0.26em;
  text-transform: uppercase;
  margin: 0 0 14px;
  color: var(--role);
}

.claims {
  display: grid;
  gap: 18px;
}

.claim {
  padding: 20px 24px 22px;
  background: var(--paper-dim);
  border-left: 3px solid var(--role);
  display: grid;
  gap: 10px;
}

.claim__top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 16px;
}

.claim__text {
  font-family: 'Newsreader', serif;
  font-size: 19px;
  line-height: 1.35;
  font-weight: 600;
  margin: 0;
}

.claim__confidence {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 13px;
  letter-spacing: 0.05em;
  color: var(--role);
  font-weight: 700;
  white-space: nowrap;
}

.claim__bar {
  height: 3px;
  background: rgba(26, 22, 20, 0.08);
  position: relative;
}

.claim__bar::after {
  content: "";
  position: absolute;
  inset: 0;
  width: var(--confidence);
  background: var(--role);
}

.claim__reasoning {
  font-size: 16px;
  line-height: 1.55;
  color: var(--ink-soft);
  margin: 0;
}

.claim__assumptions {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11.5px;
  color: var(--ink-faint);
  margin: 0;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.testimony__questions {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 10px;
}

.testimony__questions li {
  padding-left: 26px;
  position: relative;
  font-size: 16px;
  line-height: 1.5;
}

.testimony__questions li::before {
  content: "?";
  position: absolute;
  left: 0;
  top: -2px;
  font-family: 'Fraunces', serif;
  font-style: italic;
  font-weight: 700;
  font-size: 22px;
  color: var(--role);
}

.testimony__model {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--ink-faint);
}

/* META */
.meta {
  margin-top: 72px;
  padding-top: 26px;
  border-top: 4px double var(--rule);
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 12px;
  color: var(--ink-soft);
}

.meta__row {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 24px;
  padding: 8px 0;
  border-bottom: 1px dotted rgba(26, 22, 20, 0.18);
}

.meta__row:last-child { border-bottom: 0; }

.meta__label {
  text-transform: uppercase;
  letter-spacing: 0.22em;
  color: var(--ink);
}

.meta__value { word-break: break-word; }

.meta__warning {
  color: var(--accent);
}

@media (max-width: 760px) {
  .report { padding: 32px 24px 64px; }
  .question,
  .verdict__grid,
  .takeaways,
  .confidence { grid-template-columns: 1fr; gap: 18px; }
  .section-label { border-top: none; padding-top: 0; border-left: 2px solid var(--ink); padding-left: 10px; }
  .split { grid-template-columns: 1fr; gap: 32px; }
  .testimony summary { grid-template-columns: 1fr auto; gap: 18px; }
  .testimony__index { display: none; }
  .testimony__body { padding-left: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .testimony__body { animation: none; }
  .confidence__bar::after { transition: none; }
}
`;

export function renderHtmlReport(input: RenderHtmlReportInput): string {
  const { context, generatedAt, query, response } = input;
  const { metadata, perspectives, result } = response;
  const orderedPerspectives = sortPerspectives(perspectives);
  const titleSuffix = query.length > 80 ? `${query.slice(0, 80)}…` : query;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tribunal — ${escapeHtml(titleSuffix)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght,SOFT@9..144,400..900,0..100&family=Newsreader:ital,opsz,wght@0,6..72,400..700;1,6..72,400..700&family=JetBrains+Mono:wght@400..700&display=swap" rel="stylesheet">
<style>${REPORT_STYLES}</style>
</head>
<body>
<main class="report">
${renderMasthead(generatedAt)}
${renderQuestion(query, context)}
${renderVerdict(result)}
${renderTakeaways(result.keyTakeaways)}
${renderSplitSection({
  hideWhenEmpty: false,
  left: { heading: "Consensus", items: result.consensus, emptyLabel: "No consensus surfaced." },
  right: {
    heading: "Disagreements",
    items: result.disagreements,
    emptyLabel: "No disagreements surfaced.",
  },
})}
${renderSplitSection({
  hideWhenEmpty: true,
  left: { heading: "Caveats", items: result.caveats, emptyLabel: "No caveats noted." },
  right: {
    heading: "Open Questions",
    items: result.openQuestions,
    emptyLabel: "No open questions remain.",
  },
})}
${renderTestimonies(orderedPerspectives)}
${renderMeta(metadata)}
</main>
</body>
</html>`;
}

function sortPerspectives(perspectives: PerspectiveOutput[]): PerspectiveOutput[] {
  return perspectives.toSorted(
    (left, right) => ROLE_ORDER.indexOf(left.role) - ROLE_ORDER.indexOf(right.role),
  );
}

function renderMasthead(generatedAt: Date): string {
  const date = generatedAt.toUTCString().replace("GMT", "UTC");
  const caseNumber = generatedAt
    .toISOString()
    .slice(0, 19)
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replace("T", "-");

  return `<header class="masthead">
  <div class="masthead__top">
    <span>Case No. ${escapeHtml(caseNumber)}</span>
    <span>${escapeHtml(date)}</span>
  </div>
  <h1 class="masthead__title">Tribunal</h1>
  <p class="masthead__subtitle">A structured second opinion from advocate, skeptic, and analyst — synthesized by the deliberator.</p>
</header>`;
}

function renderQuestion(query: string, context: string | undefined): string {
  const contextBlock =
    context === undefined || context.trim().length === 0
      ? ""
      : `<div class="question__context">${escapeHtml(context)}</div>`;

  return `<section class="question">
  <div class="section-label">The Question</div>
  <div>
    <p class="question__text">${escapeHtml(query)}</p>
    ${contextBlock}
  </div>
</section>`;
}

function renderVerdict(result: TribunalResponse["result"]): string {
  const recommendation = result.recommendation ?? "No recommendation.";
  const confidencePercent = Math.round(result.confidence * 100);

  return `<section class="verdict">
  <div class="verdict__grid">
    <div class="section-label">The Verdict</div>
    <div>
      <p class="verdict__answer">${escapeHtml(result.answer)}</p>
      <div class="recommendation">
        <div class="recommendation__label">Recommendation</div>
        <p class="recommendation__text">${escapeHtml(recommendation)}</p>
      </div>
    </div>
  </div>
  <div class="confidence" style="--confidence:${confidencePercent}%">
    <div class="section-label">Confidence</div>
    <div class="confidence__bar" aria-hidden="true"></div>
    <div class="confidence__value">${confidencePercent}%</div>
  </div>
</section>`;
}

function renderTakeaways(takeaways: string[]): string {
  if (takeaways.length === 0) {
    return "";
  }

  const items = takeaways.map((item) => `    <li>${escapeHtml(item)}</li>`).join("\n");

  return `<section class="takeaways">
  <div class="section-label">Key Takeaways</div>
  <ol class="takeaways__list">
${items}
  </ol>
</section>`;
}

function renderSplitSection(input: {
  hideWhenEmpty: boolean;
  left: { heading: string; items: string[]; emptyLabel: string };
  right: { heading: string; items: string[]; emptyLabel: string };
}): string {
  const { hideWhenEmpty, left, right } = input;

  if (hideWhenEmpty && left.items.length === 0 && right.items.length === 0) {
    return "";
  }

  return `<section class="split">
  <div class="split__col">
    <h3>${escapeHtml(left.heading)}</h3>
    ${renderInlineList(left.items, left.emptyLabel)}
  </div>
  <div class="split__col">
    <h3>${escapeHtml(right.heading)}</h3>
    ${renderInlineList(right.items, right.emptyLabel)}
  </div>
</section>`;
}

function renderInlineList(items: string[], emptyLabel: string): string {
  if (items.length === 0) {
    return `<p class="split__empty"><em>${escapeHtml(emptyLabel)}</em></p>`;
  }

  const lis = items.map((item) => `      <li>${escapeHtml(item)}</li>`).join("\n");
  return `<ul>
${lis}
    </ul>`;
}

function renderTestimonies(perspectives: PerspectiveOutput[]): string {
  if (perspectives.length === 0) {
    return "";
  }

  const items = perspectives
    .map((perspective, index) => renderTestimony(perspective, index + 1))
    .join("\n");

  return `<section class="testimonies">
  <h2 class="testimonies__title">Testimonies</h2>
  <p class="testimonies__lede">Each specialist argued their assigned position. The deliberator above weighed the merits, not the model names.</p>
${items}
</section>`;
}

function renderTestimony(perspective: PerspectiveOutput, index: number): string {
  const accent = ROLE_ACCENTS[perspective.role];
  const claims = perspective.result.claims.map(renderClaim).join("\n");
  const openQuestions = renderTestimonyQuestions(perspective.result.openQuestions);

  return `  <details class="testimony" data-role="${escapeHtml(perspective.role)}">
    <summary>
      <span class="testimony__index">${formatIndex(index)}</span>
      <span>
        <span class="testimony__role">${escapeHtml(capitalize(perspective.role))}</span>
        <span class="testimony__tagline">${escapeHtml(accent.label)} · ${escapeHtml(accent.description)}</span>
      </span>
      <span class="testimony__chevron"><span>Open</span></span>
    </summary>
    <div class="testimony__body">
      <p class="testimony__summary">${escapeHtml(perspective.result.summary)}</p>
      <div>
        <h4 class="testimony__heading">Claims</h4>
        <div class="claims">
${claims}
        </div>
      </div>
${openQuestions}
      <div class="testimony__model">${escapeHtml(formatModelSpec(perspective.metadata.model))} · ${formatLatency(perspective.metadata.latencyMs)}</div>
    </div>
  </details>`;
}

function renderClaim(claim: PerspectiveOutput["result"]["claims"][number]): string {
  const percent = Math.round(claim.confidence * 100);
  const assumptions =
    claim.assumptions.length === 0
      ? ""
      : `        <p class="claim__assumptions">Assumptions: ${escapeHtml(claim.assumptions.join("; "))}</p>`;

  return `        <article class="claim" style="--confidence:${percent}%">
          <div class="claim__top">
            <p class="claim__text">${escapeHtml(claim.claim)}</p>
            <span class="claim__confidence">${percent}%</span>
          </div>
          <div class="claim__bar" aria-hidden="true"></div>
          <p class="claim__reasoning">${escapeHtml(claim.reasoning)}</p>
${assumptions}
        </article>`;
}

function renderTestimonyQuestions(openQuestions: string[]): string {
  if (openQuestions.length === 0) {
    return "";
  }

  const items = openQuestions
    .map((question) => `          <li>${escapeHtml(question)}</li>`)
    .join("\n");

  return `      <div>
        <h4 class="testimony__heading">Open questions</h4>
        <ul class="testimony__questions">
${items}
        </ul>
      </div>`;
}

function renderMeta(metadata: TribunalResponse["metadata"]): string {
  const rows = [
    ["Models", formatModelSet(metadata.models)],
    ["Tokens", formatTokens(metadata.totalUsage)],
    ["Cost", formatCost(metadata.estimatedCostUsd)],
    ["Latency", formatLatency(metadata.latencyMs)],
    ["Warnings", formatWarnings(metadata.warnings)],
  ];

  const html = rows
    .map(
      ([label, value]) =>
        `  <div class="meta__row"><span class="meta__label">${escapeHtml(label ?? "")}</span><span class="meta__value">${value ?? ""}</span></div>`,
    )
    .join("\n");

  return `<footer class="meta">
${html}
</footer>`;
}

function formatModelSet(models: Record<ModelRole, ModelSpec>): string {
  return (["advocate", "skeptic", "analyst", "deliberator"] as const)
    .map((role) => `${role}=${escapeHtml(formatModelSpec(models[role]))}`)
    .join(" · ");
}

function formatTokens(usage: TribunalResponse["metadata"]["totalUsage"]): string {
  if (usage === undefined) {
    return "unknown";
  }

  const parts: string[] = [];
  if (usage.inputTokens !== undefined) {
    parts.push(`in ${usage.inputTokens.toLocaleString("en-US")}`);
  }
  if (usage.outputTokens !== undefined) {
    parts.push(`out ${usage.outputTokens.toLocaleString("en-US")}`);
  }
  if (usage.totalTokens !== undefined) {
    parts.push(`total ${usage.totalTokens.toLocaleString("en-US")}`);
  }
  return parts.length === 0 ? "unknown" : parts.join(" · ");
}

function formatCost(estimatedCostUsd: number | null): string {
  if (estimatedCostUsd === null) {
    return "unknown";
  }
  return `$${estimatedCostUsd.toFixed(6)}`;
}

function formatLatency(latencyMs: number | undefined): string {
  if (latencyMs === undefined) {
    return "unknown";
  }
  if (latencyMs >= 1000) {
    return `${(latencyMs / 1000).toFixed(1)}s`;
  }
  return `${latencyMs}ms`;
}

function formatWarnings(warnings: string[]): string {
  if (warnings.length === 0) {
    return "none";
  }
  return warnings
    .map((warning) => `<span class="meta__warning">${escapeHtml(warning)}</span>`)
    .join(" · ");
}

function formatIndex(value: number): string {
  return value.toString().padStart(2, "0");
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
