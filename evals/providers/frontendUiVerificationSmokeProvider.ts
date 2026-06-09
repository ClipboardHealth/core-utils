interface ProviderOptions {
  label?: string;
}

interface SkillCall {
  name: string;
  source: string;
}

interface ProviderResponse {
  output: string;
  metadata: {
    skillCalls: SkillCall[];
  };
}

const WORKFLOW_OUTPUT_LINES = [
  "Use Storybook as the primary visual surface before product integration; do not make the app server the primary verification surface.",
  "First search existing components, stories, patterns, and tokens in Berlin, src/appV2/redesign, redesign/components, and mobile Storybook decorators before adding new UI.",
  "Run scripts/inspect-ui-verification-surface.sh and use its storybook-command output instead of guessing commands.",
  "Open the Storybook iframe.html?viewMode=story canvas URL directly and capture browser screenshot visual evidence.",
  "Check viewport sizes 375x812, 390x844, 1440x900, iPhone12, iPhone SE, and iPad Mini.",
  "Inspect loading, empty, error, disabled, long-text, and dense-data states.",
  "Classify console issues as story-introduced, global, pre-existing, provider, or decorator before claiming completion.",
  "For Figma, use Figma MCP get_design_context, get_screenshot, get_metadata, and get_variable_defs to read design context, screenshot, metadata, and variables.",
  "For screenshot references, treat the screenshot as a static visual reference and call out missing states, missing viewport coverage, and interactions that are not visible.",
  "For written idea or free-form product intent, compose from existing Clipboard components and ask for human confirmation when subjective interpretation affects product/design direction.",
  "For mobile, use the Storybook decorator details including mobile decorator wrappers.",
  "For motion, replay animation starts, in-flight, and settled states, verify prefers-reduced-motion, and use explicit transition with transform and opacity instead of transition: all.",
];

export default class FrontendUiVerificationSmokeProvider {
  public readonly label: string;

  public constructor(options: ProviderOptions = {}) {
    this.label = options.label ?? "frontend-ui-verification-smoke";
  }

  public id(): string {
    return "smoke:frontend-ui-verification";
  }

  public async callApi(): Promise<ProviderResponse> {
    return {
      output: WORKFLOW_OUTPUT_LINES.join("\n"),
      metadata: {
        skillCalls: [
          { name: "frontend-ui-verification", source: "smoke" },
          { name: "clipboard-design-engineering", source: "smoke" },
        ],
      },
    };
  }
}
