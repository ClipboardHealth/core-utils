/**
 * Shared by the `suppression-policy` rule and the `cbh-check-suppressions` CLI so both apply the
 * same parsing and verdicts.
 */

/** Rules whose suppressions hide unsafe code rather than a judgement call; fix the code instead. */
export const NEVER_SUPPRESS_RULES: readonly string[] = [
  "no-debugger",
  "typescript/no-explicit-any",
  "typescript/no-unsafe-argument",
  "typescript/no-unsafe-assignment",
  "typescript/no-unsafe-call",
  "typescript/no-unsafe-member-access",
  "typescript/no-unsafe-return",
  "typescript/strict-boolean-expressions",
];

export const SUPPRESSION_POLICY_RULE_NAME = "suppression-policy";

/**
 * Disabling either rule lets a file opt out of the policy: this rule by name, and
 * `no-abusive-eslint-disable` by permitting a blanket disable that silences every rule.
 */
const POLICY_RULES: ReadonlySet<string> = new Set(["unicorn/no-abusive-eslint-disable"]);

/**
 * Matched against the whole reason, lowercased and without trailing periods, so a specific reason
 * that mentions history still passes: "pre-existing complexity" is banned, but "pre-existing
 * complexity: this method fans out across four sub-flows" is not. A clause marker (`:`, `;`, `,`,
 * a dash, or a word such as "because") after a label introduces the specific part.
 */
const BANNED_REASONS: readonly RegExp[] = [
  // A single token, such as a TypeScript error code, a compiler option, or "ditto". A link alone
  // passes: it points at the explanation.
  /^(?!https?:\/\/)\S+$/,
  // Grandfathering labels with nothing specific after them.
  /^(legacy|existing|pre-?existing|old)( (code|debt|lint|violation|issue|error|suppression|usage)s?)*$/,
  /^legacy code retains? (this|these|the) existing( [\w-]+){0,3} (violation|assertion|issue|error)s?$/,
  /^([a-z]+-\d+:? )?pre-?existing\b(?!.*([:;,(—–]| - | (because|since|so|as|when|until|while) ))/,
  /^legacy\b[^:;,(]* predates? (this|the)( lint)? rule\b.*$/,
  // Migration markers: an inventory belongs in the rule's configuration, not on each line.
  /^legacy, use .*$/,
  /^legacy\b[^:;,(]*; remove this directive when .*$/,
  /^(todo|fixme|temp|temporary|ditto|needed|required|n\/a|ok|okay|ignore|intentional|see above|same as above|fine|safe|works|wip)$/,
];

type DirectiveKind = "lint" | "ts-expect-error" | "ts-ignore";

export interface Directive {
  kind: DirectiveKind;
  reason: string | undefined;
  /** Rule names as written, for `lint` directives; empty for a blanket disable. */
  rules: readonly string[];
}

export type ViolationId =
  | "bannedReason"
  | "forbiddenRule"
  | "missingReason"
  | "policyRule"
  | "tsIgnore";

export interface Violation {
  data: Record<string, string>;
  messageId: ViolationId;
}

export const VIOLATION_MESSAGES: Record<ViolationId, string> = {
  bannedReason:
    'Reason "{{reason}}" is too generic. State why this code needs the exception; never "legacy", "pre-existing", or a reason copied from a nearby directive.',
  forbiddenRule: "`{{rule}}` must not be suppressed. Fix the code instead.",
  missingReason:
    "Add ' -- <reason>' stating why this code needs the exception, e.g. `// oxlint-disable-next-line no-console -- CLI prints usage to stdout`.",
  policyRule: "`{{rule}}` enforces the suppression policy and must not be disabled.",
  tsIgnore:
    "Use `@ts-expect-error <reason>` instead of `@ts-ignore`, so the directive fails once the error is gone.",
};

const LINT_DIRECTIVE = /^\s*(?:eslint|oxlint)-disable(?:-next-line|-line)?(?:\s([\s\S]*))?$/;
const TS_DIRECTIVE = /^[\s*/]*@ts-(expect-error|ignore)(?![\w-])([\s\S]*)$/;
const REASON_SEPARATOR = /\s-{2,}\s|\s-{2,}$/;

/** Parses a comment's text (without its `//` or `/* *\/` delimiters). */
export function parseDirective(params: { comment: string }): Directive | undefined {
  const { comment } = params;

  const lintMatch = LINT_DIRECTIVE.exec(comment);
  if (lintMatch) {
    const body = lintMatch[1] ?? "";
    const separator = REASON_SEPARATOR.exec(body);
    const ruleText = separator === null ? body : body.slice(0, separator.index);
    const reasonText =
      separator === null ? undefined : body.slice(separator.index + separator[0].length);

    return {
      kind: "lint",
      reason: normalizeReason({ text: reasonText }),
      rules: ruleText
        .split(/[\s,]+/)
        .map((rule) => rule.trim())
        .filter((rule) => rule !== ""),
    };
  }

  const tsMatch = TS_DIRECTIVE.exec(comment);
  if (tsMatch) {
    return {
      kind: tsMatch[1] === "ignore" ? "ts-ignore" : "ts-expect-error",
      reason: normalizeReason({ text: tsMatch[2]?.replace(/^\s*(?:-{2,}|:)/, "") }),
      rules: [],
    };
  }

  return undefined;
}

export function evaluateDirective(params: { directive: Directive }): Violation[] {
  const { directive } = params;

  if (directive.kind === "ts-ignore") {
    return [{ messageId: "tsIgnore", data: {} }];
  }

  const violations: Violation[] = [];
  for (const rule of directive.rules) {
    const normalized = normalizeRuleName({ rule });
    if (isPolicyRule({ rule: normalized })) {
      violations.push({ messageId: "policyRule", data: { rule } });
    } else if (NEVER_SUPPRESS_RULES.includes(normalized)) {
      violations.push({ messageId: "forbiddenRule", data: { rule } });
    }
  }

  // A blanket disable is reported by `unicorn/no-abusive-eslint-disable`, which it cannot silence.
  if (directive.kind === "lint" && directive.rules.length === 0) {
    return violations;
  }

  if (directive.reason === undefined) {
    violations.push({ messageId: "missingReason", data: {} });
  } else if (isBannedReason({ reason: directive.reason })) {
    violations.push({ messageId: "bannedReason", data: { reason: directive.reason } });
  }

  return violations;
}

export function isBannedReason(params: { reason: string }): boolean {
  const comparable = params.reason.toLowerCase().replace(/[.!\s]+$/, "");
  return BANNED_REASONS.some((pattern) => pattern.test(comparable));
}

/** Maps the aliases Oxlint accepts to one name: `eslint/x` → `x`, `@typescript-eslint/x` → `typescript/x`. */
export function normalizeRuleName(params: { rule: string }): string {
  const { rule } = params;
  if (rule.startsWith("eslint/")) {
    return rule.slice("eslint/".length);
  }

  if (rule.startsWith("@typescript-eslint/")) {
    return `typescript/${rule.slice("@typescript-eslint/".length)}`;
  }

  return rule;
}

function isPolicyRule(params: { rule: string }): boolean {
  const { rule } = params;
  return rule.endsWith(`/${SUPPRESSION_POLICY_RULE_NAME}`) || POLICY_RULES.has(rule);
}

function normalizeReason(params: { text: string | undefined }): string | undefined {
  const reason = params.text
    ?.replaceAll(/^\s*\*\s?/gm, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
  return reason === undefined || reason === "" ? undefined : reason;
}
