// cspell:ignore viewmode

interface GradingResult {
  pass: boolean;
  score: number;
  reason: string;
}

interface PromptfooContext {
  vars?: {
    scenario?: string;
    surface?: string;
  };
}

function normalize(output: string): string {
  return output.toLowerCase();
}

function hasAnyPattern(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function hasAllPatterns(text: string, patterns: RegExp[]): boolean {
  return patterns.every((pattern) => pattern.test(text));
}

function checkAnyRequired(text: string, issues: string[], label: string, patterns: RegExp[]): void {
  if (!hasAnyPattern(text, patterns)) {
    issues.push(label);
  }
}

function checkAllRequired(text: string, issues: string[], label: string, patterns: RegExp[]): void {
  if (!hasAllPatterns(text, patterns)) {
    issues.push(label);
  }
}

function checkCoreWorkflow(text: string, issues: string[]): void {
  checkAnyRequired(text, issues, "Missing Storybook as the primary visual surface", [
    /\bstorybook\b/,
  ]);
  checkAllRequired(text, issues, "Missing deterministic helper-script discovery", [
    /inspect-ui-verification-surface\.sh/,
    /\bstorybook-command\b/,
  ]);
  checkAnyRequired(text, issues, "Missing Storybook canvas or iframe URL", [
    /iframe\.html\?viewmode=story/,
    /\bcanvas url\b/,
    /\bstorybook iframe\b/,
  ]);
  checkAnyRequired(text, issues, "Missing browser screenshot or visual evidence capture", [
    /\bscreenshot\b/,
    /\bvisual evidence\b/,
    /\bcapture evidence\b/,
  ]);
  checkAllRequired(text, issues, "Missing viewport coverage", [/\bviewport\b/, /\b1440x900\b/]);
  checkAnyRequired(text, issues, "Missing mobile viewport coverage", [
    /\b375x812\b/,
    /\b390x844\b/,
    /\biphone\b/,
  ]);
  checkAllRequired(text, issues, "Missing inspected UI states", [
    /\bloading\b/,
    /\bempty\b/,
    /\berror\b/,
    /\bdisabled\b/,
    /\blong[- ]text\b/,
    /\bdense[- ]data\b/,
  ]);
  checkAnyRequired(text, issues, "Missing console classification", [
    /\bconsole\b.*\b(?:story-introduced|global|pre-existing|provider|decorator)/s,
    /\b(?:story-introduced|global|pre-existing|provider|decorator)\b.*\bconsole\b/s,
  ]);
  checkAnyRequired(text, issues, "Missing component or story search before new UI", [
    /\bexisting components?\b/,
    /\bsearch\b.*\b(?:stories|components|patterns)\b/s,
    /\breuse\b.*\b(?:components|patterns|tokens)\b/s,
  ]);
}

function checkSourceScenario(text: string, scenario: string | undefined, issues: string[]): void {
  if (scenario === "figma") {
    checkAnyRequired(text, issues, "Missing Figma MCP/design-context extraction", [
      /get_design_context/,
      /design context/,
      /figma mcp/,
    ]);
    checkAnyRequired(text, issues, "Missing Figma screenshot extraction", [
      /get_screenshot/,
      /figma screenshot/,
    ]);
    checkAnyRequired(text, issues, "Missing Figma metadata or variables", [
      /get_metadata/,
      /metadata/,
      /get_variable_defs/,
      /\bvariables?\b/,
    ]);
    return;
  }

  if (scenario === "screenshot") {
    checkAnyRequired(text, issues, "Missing screenshot-as-reference handling", [
      /screenshot.*reference/s,
      /static.*reference/s,
      /visual reference/,
    ]);
    checkAnyRequired(text, issues, "Missing callout for states or viewport gaps", [
      /missing.*states/s,
      /missing.*viewport/s,
      /not visible/,
      /call out.*(?:states|viewport|interaction)/s,
    ]);
    return;
  }

  if (scenario === "idea") {
    checkAnyRequired(text, issues, "Missing written-idea fallback", [
      /written idea/,
      /description only/,
      /product intent/,
      /free-form/,
    ]);
    checkAnyRequired(text, issues, "Missing human confirmation for subjective interpretation", [
      /human confirmation/,
      /ask.*confirm/s,
      /confirmation.*subjective/s,
      /storybook checkpoint.*confirm/s,
    ]);
  }
}

function checkSurface(text: string, surface: string | undefined, issues: string[]): void {
  if (surface === "admin") {
    checkAnyRequired(text, issues, "Missing admin Berlin/redesign component mapping", [
      /\bberlin\b/,
      /src\/app[v]2\/redesign/,
      /redesign\/components/,
    ]);
    return;
  }

  if (surface === "mobile") {
    checkAnyRequired(text, issues, "Missing mobile Storybook/decorator details", [
      /theme.*decorator/s,
      /storybook.*decorator/s,
      /mobile.*decorator/s,
    ]);
    checkAnyRequired(text, issues, "Missing mobile viewport presets", [
      /iphone12/,
      /390x844/,
      /iphone\s*se/,
      /375x667/,
      /ipad\s*mini/,
      /768x1024/,
    ]);
  }
}

function checkMotionScenario(text: string, scenario: string | undefined, issues: string[]): void {
  if (scenario !== "motion") {
    return;
  }

  checkAnyRequired(text, issues, "Missing deterministic motion replay/in-flight states", [
    /\breplay\b/,
    /\bin-flight\b/,
    /\bsettled\b/,
    /animation.*starts.*settles/s,
  ]);
  checkAnyRequired(text, issues, "Missing reduced-motion handling", [
    /prefers-reduced-motion/,
    /reduced motion/,
  ]);
  checkAllRequired(text, issues, "Missing transition discipline", [
    /transform.*opacity/s,
    /explicit transition/,
  ]);
  checkForbiddenTransitionAll(text, issues);
}

function isExplicitWarningSentence(sentence: string): boolean {
  return /\b(?:do not|don't|avoid|never|instead of)\b/.test(sentence);
}

function checkForbiddenTransitionAll(text: string, issues: string[]): void {
  const usesTransitionAll = text
    .split(/[.;\n]/)
    .some((sentence) => /transition:\s*all/.test(sentence) && !isExplicitWarningSentence(sentence));

  if (usesTransitionAll) {
    issues.push("Allows transition: all instead of explicit motion properties");
  }
}

function checkForbiddenPrimaryAppServer(text: string, issues: string[]): void {
  const appServerPrimarySentence = text.split(/[.;\n]/).some((sentence) => {
    const mentionsPrimaryAppServer =
      /\bapp server\b/.test(sentence) && /\bprimary\b/.test(sentence);

    return mentionsPrimaryAppServer && !isExplicitWarningSentence(sentence);
  });

  if (appServerPrimarySentence) {
    issues.push("Uses app server as the primary visual verification surface");
  }
}

// oxlint-disable import/no-anonymous-default-export
export default function (output: string, context?: PromptfooContext): GradingResult {
  const text = normalize(output);
  const issues: string[] = [];
  const scenario = context?.vars?.scenario;
  const surface = context?.vars?.surface;

  checkCoreWorkflow(text, issues);
  checkSourceScenario(text, scenario, issues);
  checkSurface(text, surface, issues);
  checkMotionScenario(text, scenario, issues);
  checkForbiddenPrimaryAppServer(text, issues);

  const pass = issues.length === 0;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? "Frontend UI verification workflow preserved"
      : `Frontend UI verification gaps: ${issues.join("; ")}`,
  };
}
