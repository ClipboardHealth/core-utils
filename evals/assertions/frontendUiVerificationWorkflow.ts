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

function hasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function checkRequired(text: string, issues: string[], label: string, patterns: RegExp[]): void {
  if (!hasAny(text, patterns)) {
    issues.push(label);
  }
}

function checkCoreWorkflow(text: string, issues: string[]): void {
  checkRequired(text, issues, "Missing Storybook as the primary visual surface", [/\bstorybook\b/]);
  checkRequired(text, issues, "Missing deterministic helper-script discovery", [
    /inspect-ui-verification-surface\.sh/,
    /\bstorybook-command\b/,
  ]);
  checkRequired(text, issues, "Missing Storybook canvas or iframe URL", [
    /iframe\.html\?viewmode=story/,
    /\bcanvas url\b/,
    /\bstorybook iframe\b/,
  ]);
  checkRequired(text, issues, "Missing browser screenshot or visual evidence capture", [
    /\bscreenshot\b/,
    /\bvisual evidence\b/,
    /\bcapture evidence\b/,
  ]);
  checkRequired(text, issues, "Missing viewport coverage", [
    /\bviewport\b/,
    /\b375x812\b/,
    /\b390x844\b/,
    /\b1440x900\b/,
    /\biphone\b/,
  ]);
  checkRequired(text, issues, "Missing inspected UI states", [
    /\bloading\b/,
    /\bempty\b/,
    /\berror\b/,
    /\bdisabled\b/,
    /\blong[- ]text\b/,
    /\bdense[- ]data\b/,
  ]);
  checkRequired(text, issues, "Missing console classification", [
    /\bconsole\b.*\b(?:story-introduced|global|pre-existing|provider|decorator)/s,
    /\b(?:story-introduced|global|pre-existing|provider|decorator)\b.*\bconsole\b/s,
  ]);
  checkRequired(text, issues, "Missing component or story search before new UI", [
    /\bexisting components?\b/,
    /\bsearch\b.*\b(?:stories|components|patterns)\b/s,
    /\breuse\b.*\b(?:components|patterns|tokens)\b/s,
  ]);
}

function checkSourceScenario(text: string, scenario: string | undefined, issues: string[]): void {
  if (scenario === "figma") {
    checkRequired(text, issues, "Missing Figma MCP/design-context extraction", [
      /get_design_context/,
      /design context/,
      /figma mcp/,
    ]);
    checkRequired(text, issues, "Missing Figma screenshot extraction", [
      /get_screenshot/,
      /figma screenshot/,
    ]);
    checkRequired(text, issues, "Missing Figma metadata or variables", [
      /get_metadata/,
      /metadata/,
      /get_variable_defs/,
      /\bvariables?\b/,
    ]);
    return;
  }

  if (scenario === "screenshot") {
    checkRequired(text, issues, "Missing screenshot-as-reference handling", [
      /screenshot.*reference/s,
      /static.*reference/s,
      /visual reference/,
    ]);
    checkRequired(text, issues, "Missing callout for states or viewport gaps", [
      /missing.*states/s,
      /missing.*viewport/s,
      /not visible/,
      /call out.*(?:states|viewport|interaction)/s,
    ]);
    return;
  }

  if (scenario === "idea") {
    checkRequired(text, issues, "Missing written-idea fallback", [
      /written idea/,
      /description only/,
      /product intent/,
      /free-form/,
    ]);
    checkRequired(text, issues, "Missing human confirmation for subjective interpretation", [
      /human confirmation/,
      /ask.*confirm/s,
      /confirmation.*subjective/s,
      /storybook checkpoint.*confirm/s,
    ]);
  }
}

function checkSurface(text: string, surface: string | undefined, issues: string[]): void {
  if (surface === "admin") {
    checkRequired(text, issues, "Missing admin Berlin/redesign component mapping", [
      /\bberlin\b/,
      /src\/app[v]2\/redesign/,
      /redesign\/components/,
    ]);
    return;
  }

  if (surface === "mobile") {
    checkRequired(text, issues, "Missing mobile Storybook/decorator details", [
      /theme.*decorator/s,
      /storybook.*decorator/s,
      /mobile.*decorator/s,
    ]);
    checkRequired(text, issues, "Missing mobile viewport presets", [
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

  checkRequired(text, issues, "Missing deterministic motion replay/in-flight states", [
    /\breplay\b/,
    /\bin-flight\b/,
    /\bsettled\b/,
    /animation.*starts.*settles/s,
  ]);
  checkRequired(text, issues, "Missing reduced-motion handling", [
    /prefers-reduced-motion/,
    /reduced motion/,
  ]);
  checkRequired(text, issues, "Missing transition discipline", [
    /transition: all/,
    /transform.*opacity/s,
    /explicit transition/,
  ]);
}

function checkForbiddenPrimaryAppServer(text: string, issues: string[]): void {
  const appServerPrimarySentence = text.split(/[.;\n]/).some((sentence) => {
    const mentionsPrimaryAppServer =
      /\bapp server\b/.test(sentence) && /\bprimary\b/.test(sentence);
    const isWarningAgainstPrimaryAppServer = /\b(?:do not|don't|avoid|never|not|instead of)\b/.test(
      sentence,
    );

    return mentionsPrimaryAppServer && !isWarningAgainstPrimaryAppServer;
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
