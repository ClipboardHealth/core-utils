import path from "node:path";

import ts from "typescript";

import { compareViolations } from "./internal/violations";

export const PLAYWRIGHT_FLAKE_RULE_IDS = [
  "fixed-sleep",
  "response-wait",
  "retry-classification",
  "test-data-identity",
  "shared-readiness",
] as const;
const PLAYWRIGHT_FLAKE_RULE_ID_SET: ReadonlySet<string> = new Set(PLAYWRIGHT_FLAKE_RULE_IDS);

export type PlaywrightFlakeRuleId = (typeof PLAYWRIGHT_FLAKE_RULE_IDS)[number];

export interface PlaywrightFlakeLinterAllowlistEntry {
  filePathPattern: string;
  reason: string;
  ruleId: PlaywrightFlakeRuleId;
}

export interface SharedReadinessMechanism {
  directCallNames: readonly string[];
  filePathPattern: string;
  name: string;
  sharedHelperNames: readonly string[];
}

export interface PlaywrightFlakeLinterConfig {
  allowlist?: readonly PlaywrightFlakeLinterAllowlistEntry[];
  hardenedIdentityHelperNames?: readonly string[];
  identityHelperMinimumLengths?: Readonly<Record<string, number>>;
  identityNamePattern?: string;
  responseWaitCallNames?: readonly string[];
  retryHelperNames?: readonly string[];
  scanRoots: readonly string[];
  sharedReadinessMechanisms?: readonly SharedReadinessMechanism[];
  specificRequestMatcherNames?: readonly string[];
  specFilePattern?: string;
  transientClassifierNamePatterns?: readonly string[];
  undiscriminatingRetryHelperNames?: readonly string[];
}

export interface PlaywrightFlakePatternViolation {
  column: number;
  filePath: string;
  line: number;
  message: string;
  ruleId: PlaywrightFlakeRuleId;
}

const ALLOWLIST_PREFIX = "flake-lint-allow";
const DEFAULT_IDENTITY_NAME_PATTERN =
  "(address|email|identifier|license|message|name|phone|street|suffix|title|id$)";
const DEFAULT_RESPONSE_WAIT_CALL_NAMES = ["waitForResponse"];
const DEFAULT_SPECIFIC_REQUEST_MATCHER_NAMES = ["isMatchingRequest"];
const DEFAULT_SPEC_FILE_PATTERN = String.raw`\.spec\.[cm]?[jt]sx?$`;
const DEFAULT_TRANSIENT_CLASSIFIER_NAME_PATTERNS = ["^isRetryable", "retryClassification"];
const RULE_MESSAGES: Readonly<Record<Exclude<PlaywrightFlakeRuleId, "shared-readiness">, string>> =
  {
    "fixed-sleep":
      "Fixed sleep anti-pattern (rubric B2). Replace waitForTimeout/setTimeout delays with a deterministic readiness signal",
    "response-wait":
      "Undiscriminating response-wait anti-pattern (rubric B2). Match the request method, URL, and a discriminating request predicate",
    "retry-classification":
      "Undiscriminating retry anti-pattern (rubric B1). Retry only failures classified as transient and fail fast for genuine failures",
    "test-data-identity":
      "Low-entropy parallel-worker identity collision anti-pattern (rubric A2). Use a configured hardened random helper or UUID-backed identity",
  };

interface FindPlaywrightFlakePatternViolationsParams {
  config: PlaywrightFlakeLinterConfig;
  filePath: string;
  source: string;
}

interface AddViolationParams {
  message: string;
  node: ts.Node;
  ruleId: PlaywrightFlakeRuleId;
}

interface ParsePlaywrightFlakeLinterConfigParams {
  sourceDescription: string;
  value: unknown;
}

export function definePlaywrightFlakeLinterConfig(
  config: PlaywrightFlakeLinterConfig,
): PlaywrightFlakeLinterConfig {
  validateConfig(config);

  return config;
}

export function parsePlaywrightFlakeLinterConfig({
  sourceDescription,
  value,
}: ParsePlaywrightFlakeLinterConfigParams): PlaywrightFlakeLinterConfig {
  if (!isPlaywrightFlakeLinterConfig(value)) {
    throw new Error(`Invalid Playwright flake linter config at ${sourceDescription}.`);
  }

  return definePlaywrightFlakeLinterConfig(value);
}

export function findPlaywrightFlakePatternViolations({
  config,
  filePath,
  source,
}: FindPlaywrightFlakePatternViolationsParams): PlaywrightFlakePatternViolation[] {
  validateConfig(config);

  const normalizedFilePath = normalizeFilePath(filePath);
  const sourceFile = ts.createSourceFile(
    normalizedFilePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(normalizedFilePath),
  );
  const violations: PlaywrightFlakePatternViolation[] = [];
  const isSpecFile = new RegExp(config.specFilePattern ?? DEFAULT_SPEC_FILE_PATTERN).test(
    normalizedFilePath,
  );
  const sharedReadinessMechanisms = getMatchingSharedReadinessMechanisms({
    config,
    filePath: normalizedFilePath,
  });

  function addViolation({ message, node, ruleId }: AddViolationParams): void {
    if (
      hasInlineAllowlistComment({
        node,
        ruleId,
        source,
        sourceFile,
      }) ||
      isAllowlistedByConfig({
        config,
        filePath: normalizedFilePath,
        ruleId,
      })
    ) {
      return;
    }

    const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    violations.push({
      column: position.character + 1,
      filePath: normalizedFilePath,
      line: position.line + 1,
      message,
      ruleId,
    });
  }

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      if (isSpecFile && isFixedSleepCall(node)) {
        addViolation({
          message: RULE_MESSAGES["fixed-sleep"],
          node,
          ruleId: "fixed-sleep",
        });
      }

      if (
        isConfiguredCall({
          callExpression: node,
          names: getResponseWaitCallNames(config),
        }) &&
        hasUndiscriminatingResponsePredicate({
          callExpression: node,
          specificRequestMatcherNames:
            config.specificRequestMatcherNames ?? DEFAULT_SPECIFIC_REQUEST_MATCHER_NAMES,
        })
      ) {
        addViolation({
          message: RULE_MESSAGES["response-wait"],
          node,
          ruleId: "response-wait",
        });
      }

      for (const mechanism of sharedReadinessMechanisms) {
        if (!mechanism.directCallNames.includes(getCallName(node) ?? "")) {
          continue;
        }

        addViolation({
          message: getSharedReadinessMessage(mechanism),
          node,
          ruleId: "shared-readiness",
        });
      }

      if (isUndiscriminatingRetryCall({ callExpression: node, config })) {
        addViolation({
          message: RULE_MESSAGES["retry-classification"],
          node,
          ruleId: "retry-classification",
        });
      }

      if (isLowEntropyTestDataIdentityCall({ callExpression: node, config })) {
        addViolation({
          message: RULE_MESSAGES["test-data-identity"],
          node,
          ruleId: "test-data-identity",
        });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations.toSorted(compareViolations);
}

function validateConfig(config: PlaywrightFlakeLinterConfig): void {
  if (
    config.scanRoots.length === 0 ||
    config.scanRoots.some((scanRoot) => scanRoot.trim().length === 0)
  ) {
    throw new Error("Playwright flake linter config requires at least one scan root.");
  }

  for (const allowlistEntry of config.allowlist ?? []) {
    if (allowlistEntry.reason.trim().length === 0) {
      throw new Error("Every Playwright flake linter allowlist reason must be non-empty.");
    }

    validatePattern({
      label: "allowlist file path",
      pattern: allowlistEntry.filePathPattern,
    });
  }

  validateOptionalPattern({
    label: "spec file",
    pattern: config.specFilePattern,
  });
  validateOptionalPattern({
    label: "identity name",
    pattern: config.identityNamePattern,
  });

  for (const pattern of config.transientClassifierNamePatterns ?? []) {
    validatePattern({ label: "transient classifier name", pattern });
  }

  for (const [helperName, minimumLength] of Object.entries(
    config.identityHelperMinimumLengths ?? {},
  )) {
    if (helperName.trim().length === 0 || !Number.isInteger(minimumLength) || minimumLength <= 0) {
      throw new Error(
        "Identity helper minimum lengths require a non-empty helper name and positive integer.",
      );
    }
  }

  for (const mechanism of config.sharedReadinessMechanisms ?? []) {
    if (
      mechanism.name.trim().length === 0 ||
      mechanism.directCallNames.length === 0 ||
      mechanism.sharedHelperNames.length === 0
    ) {
      throw new Error(
        "Shared readiness mechanisms require a name, direct call, and shared helper.",
      );
    }

    validatePattern({
      label: `${mechanism.name} file path`,
      pattern: mechanism.filePathPattern,
    });
  }
}

interface ValidateOptionalPatternParams {
  label: string;
  pattern: string | undefined;
}

function validateOptionalPattern({ label, pattern }: ValidateOptionalPatternParams): void {
  if (pattern !== undefined) {
    validatePattern({ label, pattern });
  }
}

interface ValidatePatternParams {
  label: string;
  pattern: string;
}

function validatePattern({ label, pattern }: ValidatePatternParams): void {
  try {
    new RegExp(pattern).test("");
  } catch {
    throw new Error(`Invalid ${label} pattern: ${pattern}`);
  }
}

function isFixedSleepCall(callExpression: ts.CallExpression): boolean {
  const { expression } = callExpression;
  const isQualifiedSetTimeout =
    ts.isPropertyAccessExpression(expression) &&
    expression.name.text === "setTimeout" &&
    ts.isIdentifier(expression.expression) &&
    ["globalThis", "self", "window"].includes(expression.expression.text);

  return (
    (ts.isPropertyAccessExpression(expression) && expression.name.text === "waitForTimeout") ||
    isQualifiedSetTimeout ||
    (ts.isIdentifier(expression) && expression.text === "setTimeout")
  );
}

interface HasUndiscriminatingResponsePredicateParams {
  callExpression: ts.CallExpression;
  specificRequestMatcherNames: readonly string[];
}

function hasUndiscriminatingResponsePredicate({
  callExpression,
  specificRequestMatcherNames,
}: HasUndiscriminatingResponsePredicateParams): boolean {
  const predicate = resolveFunctionLike({
    expression: callExpression.arguments[0],
    referenceNode: callExpression,
  });

  if (predicate === undefined) {
    return false;
  }

  const responseParameter = predicate.parameters[0]?.name;

  if (responseParameter === undefined || !ts.isIdentifier(responseParameter)) {
    return false;
  }

  const responseName = responseParameter.text;
  let checksStatus = false;
  let delegatesSpecificRequestMatching = false;
  let checksMethod = false;
  let checksUrl = false;
  let checksDiscriminatingRequestProperty = false;

  function visitResultDependency(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      checksStatus ||= isDirectResponseCall({
        callExpression: node,
        methodNames: ["ok", "status"],
        responseName,
      });
      delegatesSpecificRequestMatching ||=
        ts.isIdentifier(node.expression) &&
        specificRequestMatcherNames.includes(node.expression.text);
      checksUrl ||= isDirectResponseCall({
        callExpression: node,
        methodNames: ["url"],
        responseName,
      });
      checksMethod ||= isResponseRequestCall({
        callExpression: node,
        methodNames: ["method"],
        responseName,
      });
      checksDiscriminatingRequestProperty ||=
        isResponseRequestCall({
          callExpression: node,
          methodNames: ["headerValue", "postData", "postDataJSON", "resourceType"],
          responseName,
        }) || isDynamicResponseUrlMatch({ callExpression: node, responseName });
    }

    if (ts.isPropertyAccessExpression(node) && node.name.text === "searchParams") {
      checksDiscriminatingRequestProperty = true;
    }

    ts.forEachChild(node, visitResultDependency);
  }

  for (const resultNode of getPredicateResultDependencies(predicate)) {
    visitResultDependency(resultNode);
  }

  if (!checksStatus) {
    return false;
  }

  return (
    !delegatesSpecificRequestMatching &&
    (!checksMethod || !checksUrl || !checksDiscriminatingRequestProperty)
  );
}

interface ResponseCallParams {
  callExpression: ts.CallExpression;
  methodNames: readonly string[];
  responseName: string;
}

function isDirectResponseCall({
  callExpression,
  methodNames,
  responseName,
}: ResponseCallParams): boolean {
  const { expression } = callExpression;

  return (
    ts.isPropertyAccessExpression(expression) &&
    methodNames.includes(expression.name.text) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === responseName
  );
}

function isResponseRequestCall({
  callExpression,
  methodNames,
  responseName,
}: ResponseCallParams): boolean {
  const { expression } = callExpression;

  if (
    !ts.isPropertyAccessExpression(expression) ||
    !methodNames.includes(expression.name.text) ||
    !ts.isCallExpression(expression.expression)
  ) {
    return false;
  }

  return isDirectResponseCall({
    callExpression: expression.expression,
    methodNames: ["request"],
    responseName,
  });
}

interface IsDynamicResponseUrlMatchParams {
  callExpression: ts.CallExpression;
  responseName: string;
}

function isDynamicResponseUrlMatch({
  callExpression,
  responseName,
}: IsDynamicResponseUrlMatchParams): boolean {
  const { expression } = callExpression;

  return (
    ts.isPropertyAccessExpression(expression) &&
    ["endsWith", "includes", "startsWith"].includes(expression.name.text) &&
    ts.isCallExpression(expression.expression) &&
    isDirectResponseCall({
      callExpression: expression.expression,
      methodNames: ["url"],
      responseName,
    }) &&
    callExpression.arguments.some(ts.isTemplateExpression)
  );
}

function getPredicateResultDependencies(predicate: ts.FunctionLikeDeclaration): ts.Node[] {
  if (predicate.body === undefined) {
    return [];
  }

  const predicateBody = predicate.body;

  if (!ts.isBlock(predicateBody)) {
    return [predicateBody];
  }

  const dependencies: ts.Node[] = [];
  const initializerByName = new Map<string, ts.Expression>();

  function visit(node: ts.Node): void {
    if (node !== predicate && ts.isFunctionLike(node)) {
      return;
    }

    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined
    ) {
      initializerByName.set(node.name.text, node.initializer);
    }

    if (ts.isReturnStatement(node) && node.expression !== undefined) {
      dependencies.push(node.expression);
      addGoverningConditions({
        boundary: predicateBody,
        dependencies,
        node,
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(predicateBody);

  let dependencyIndex = 0;

  while (dependencyIndex < dependencies.length) {
    const dependency = dependencies[dependencyIndex];
    dependencyIndex += 1;

    if (dependency === undefined) {
      continue;
    }

    addReferencedInitializers({
      dependencies,
      initializerByName,
      node: dependency,
    });
  }

  return dependencies;
}

interface AddReferencedInitializersParams {
  dependencies: ts.Node[];
  initializerByName: ReadonlyMap<string, ts.Expression>;
  node: ts.Node;
}

function addReferencedInitializers({
  dependencies,
  initializerByName,
  node,
}: AddReferencedInitializersParams): void {
  if (ts.isIdentifier(node)) {
    const initializer = initializerByName.get(node.text);

    if (initializer !== undefined && !dependencies.includes(initializer)) {
      dependencies.push(initializer);
    }
  }

  ts.forEachChild(node, (childNode) => {
    addReferencedInitializers({
      dependencies,
      initializerByName,
      node: childNode,
    });
  });
}

interface AddGoverningConditionsParams {
  boundary: ts.Node;
  dependencies: ts.Node[];
  node: ts.Node;
}

function addGoverningConditions({
  boundary,
  dependencies,
  node,
}: AddGoverningConditionsParams): void {
  let ancestor = node.parent;

  while (ancestor !== undefined && ancestor !== boundary) {
    if (ts.isIfStatement(ancestor)) {
      dependencies.push(ancestor.expression);
    }

    ancestor = ancestor.parent;
  }
}

interface ResolveFunctionLikeParams {
  expression: ts.Expression | undefined;
  referenceNode: ts.Node;
}

function resolveFunctionLike({
  expression,
  referenceNode,
}: ResolveFunctionLikeParams): ts.FunctionLikeDeclaration | undefined {
  if (expression === undefined) {
    return undefined;
  }

  if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) {
    return expression;
  }

  if (!ts.isIdentifier(expression)) {
    return undefined;
  }

  let scope: ts.Node | undefined = referenceNode.parent;

  while (scope !== undefined) {
    if (ts.isBlock(scope) || ts.isSourceFile(scope)) {
      const declaration = findFunctionLikeInStatements({
        functionName: expression.text,
        statements: scope.statements,
      });

      if (declaration !== undefined) {
        return declaration;
      }
    }

    scope = scope.parent;
  }

  return undefined;
}

interface FindFunctionLikeInStatementsParams {
  functionName: string;
  statements: ts.NodeArray<ts.Statement>;
}

function findFunctionLikeInStatements({
  functionName,
  statements,
}: FindFunctionLikeInStatementsParams): ts.FunctionLikeDeclaration | undefined {
  for (const statement of statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === functionName) {
      return statement;
    }

    if (!ts.isVariableStatement(statement)) {
      continue;
    }

    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === functionName &&
        declaration.initializer !== undefined &&
        (ts.isArrowFunction(declaration.initializer) ||
          ts.isFunctionExpression(declaration.initializer))
      ) {
        return declaration.initializer;
      }
    }
  }

  return undefined;
}

interface IsUndiscriminatingRetryCallParams {
  callExpression: ts.CallExpression;
  config: PlaywrightFlakeLinterConfig;
}

function isUndiscriminatingRetryCall({
  callExpression,
  config,
}: IsUndiscriminatingRetryCallParams): boolean {
  const callName = getCallName(callExpression);

  if (callName === undefined) {
    return false;
  }

  if ((config.undiscriminatingRetryHelperNames ?? []).includes(callName)) {
    return true;
  }

  if (!(config.retryHelperNames ?? []).includes(callName)) {
    return false;
  }

  const callback = resolveFunctionLike({
    expression: callExpression.arguments[0],
    referenceNode: callExpression,
  });

  if (callback === undefined) {
    return true;
  }

  const classifierPatterns = (
    config.transientClassifierNamePatterns ?? DEFAULT_TRANSIENT_CLASSIFIER_NAME_PATTERNS
  ).map((pattern) => new RegExp(pattern));

  return !usesTransientClassifierToGovernRetry({
    callback,
    classifierPatterns,
  });
}

interface UsesTransientClassifierToGovernRetryParams {
  callback: ts.FunctionLikeDeclaration;
  classifierPatterns: readonly RegExp[];
}

function usesTransientClassifierToGovernRetry({
  callback,
  classifierPatterns,
}: UsesTransientClassifierToGovernRetryParams): boolean {
  if (callback.body === undefined || !ts.isBlock(callback.body)) {
    return false;
  }

  const bailParameter = callback.parameters[0]?.name;

  if (bailParameter === undefined || !ts.isIdentifier(bailParameter)) {
    return false;
  }

  const bailParameterName = bailParameter.text;
  const dependencies: ts.Node[] = [];
  const initializerByName = new Map<string, ts.Expression>();
  const callbackBody = callback.body;

  function visit(node: ts.Node): void {
    if (node !== callback && ts.isFunctionLike(node)) {
      return;
    }

    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined
    ) {
      initializerByName.set(node.name.text, node.initializer);
    }

    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === bailParameterName
    ) {
      addGoverningConditions({
        boundary: callbackBody,
        dependencies,
        node,
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(callbackBody);

  for (const dependency of dependencies) {
    addReferencedInitializers({
      dependencies,
      initializerByName,
      node: dependency,
    });
  }

  return dependencies.some((dependency) =>
    containsClassifierReference({
      classifierPatterns,
      node: dependency,
    }),
  );
}

interface ContainsClassifierReferenceParams {
  classifierPatterns: readonly RegExp[];
  node: ts.Node;
}

function containsClassifierReference({
  classifierPatterns,
  node,
}: ContainsClassifierReferenceParams): boolean {
  if (ts.isIdentifier(node) && classifierPatterns.some((pattern) => pattern.test(node.text))) {
    return true;
  }

  return node.getChildren().some((childNode) =>
    containsClassifierReference({
      classifierPatterns,
      node: childNode,
    }),
  );
}

interface IsLowEntropyTestDataIdentityCallParams {
  callExpression: ts.CallExpression;
  config: PlaywrightFlakeLinterConfig;
}

function isLowEntropyTestDataIdentityCall({
  callExpression,
  config,
}: IsLowEntropyTestDataIdentityCallParams): boolean {
  const identityOwnerName = findIdentityContextName(callExpression);

  if (
    identityOwnerName === undefined ||
    !new RegExp(config.identityNamePattern ?? DEFAULT_IDENTITY_NAME_PATTERN, "i").test(
      identityOwnerName,
    )
  ) {
    return false;
  }

  const callName = getCallName(callExpression);

  if (callName !== undefined && (config.hardenedIdentityHelperNames ?? []).includes(callName)) {
    return false;
  }

  if (isLowEntropyBuiltInIdentitySource(callExpression)) {
    return true;
  }

  if (callName === undefined || !(callName in (config.identityHelperMinimumLengths ?? {}))) {
    return false;
  }

  const [lengthArgument] = callExpression.arguments;

  if (lengthArgument === undefined || !ts.isNumericLiteral(lengthArgument)) {
    return true;
  }

  const minimumLength = config.identityHelperMinimumLengths?.[callName];

  return minimumLength !== undefined && Number(lengthArgument.text) < minimumLength;
}

function isLowEntropyBuiltInIdentitySource(callExpression: ts.CallExpression): boolean {
  const { expression } = callExpression;

  return (
    ts.isPropertyAccessExpression(expression) &&
    ((expression.expression.getText() === "Date" && expression.name.text === "now") ||
      (expression.expression.getText() === "Math" && expression.name.text === "random"))
  );
}

function findIdentityContextName(node: ts.Node): string | undefined {
  let ancestor = node.parent;

  while (ancestor !== undefined) {
    if (ts.isVariableDeclaration(ancestor) && ts.isIdentifier(ancestor.name)) {
      return ancestor.name.text;
    }

    if (ts.isPropertyAssignment(ancestor)) {
      return ancestor.name.getText();
    }

    if (
      ts.isCallExpression(ancestor) &&
      ts.isPropertyAccessExpression(ancestor.expression) &&
      ancestor.expression.name.text === "fill"
    ) {
      return collectStringLiteralText(ancestor);
    }

    if (ts.isStatement(ancestor)) {
      return undefined;
    }

    ancestor = ancestor.parent;
  }

  return undefined;
}

function collectStringLiteralText(node: ts.Node): string {
  const stringValues: string[] = [];

  function visit(descendant: ts.Node): void {
    if (ts.isStringLiteralLike(descendant)) {
      stringValues.push(descendant.text);
    }

    ts.forEachChild(descendant, visit);
  }

  visit(node);
  return stringValues.join(" ");
}

interface HasInlineAllowlistCommentParams {
  node: ts.Node;
  ruleId: PlaywrightFlakeRuleId;
  source: string;
  sourceFile: ts.SourceFile;
}

function hasInlineAllowlistComment({
  node,
  ruleId,
  source,
  sourceFile,
}: HasInlineAllowlistCommentParams): boolean {
  const allowlistPattern = new RegExp(
    `${ALLOWLIST_PREFIX}\\s+${escapeRegExp(ruleId)}\\s+--\\s+\\S`,
  );
  let currentNode: ts.Node | undefined = node;

  while (currentNode !== undefined && currentNode !== sourceFile) {
    const leadingCommentRanges =
      ts.getLeadingCommentRanges(source, currentNode.getFullStart()) ?? [];

    if (
      leadingCommentRanges.some((range) =>
        allowlistPattern.test(source.slice(range.pos, range.end)),
      )
    ) {
      return true;
    }

    if (ts.isStatement(currentNode)) {
      return false;
    }

    currentNode = currentNode.parent;
  }

  return false;
}

interface IsAllowlistedByConfigParams {
  config: PlaywrightFlakeLinterConfig;
  filePath: string;
  ruleId: PlaywrightFlakeRuleId;
}

function isAllowlistedByConfig({ config, filePath, ruleId }: IsAllowlistedByConfigParams): boolean {
  return (config.allowlist ?? []).some(
    (entry) => entry.ruleId === ruleId && new RegExp(entry.filePathPattern).test(filePath),
  );
}

interface GetMatchingSharedReadinessMechanismsParams {
  config: PlaywrightFlakeLinterConfig;
  filePath: string;
}

function getMatchingSharedReadinessMechanisms({
  config,
  filePath,
}: GetMatchingSharedReadinessMechanismsParams): readonly SharedReadinessMechanism[] {
  return (config.sharedReadinessMechanisms ?? []).filter((mechanism) =>
    new RegExp(mechanism.filePathPattern).test(filePath),
  );
}

function getSharedReadinessMessage(mechanism: SharedReadinessMechanism): string {
  return (
    `Per-spec ${mechanism.name} gate anti-pattern (rubric A1 shared-helper rule). ` +
    `Use or extend ${mechanism.sharedHelperNames.join(" or ")}`
  );
}

function getResponseWaitCallNames(config: PlaywrightFlakeLinterConfig): readonly string[] {
  return config.responseWaitCallNames ?? DEFAULT_RESPONSE_WAIT_CALL_NAMES;
}

interface IsConfiguredCallParams {
  callExpression: ts.CallExpression;
  names: readonly string[];
}

function isConfiguredCall({ callExpression, names }: IsConfiguredCallParams): boolean {
  const callName = getCallName(callExpression);

  return callName !== undefined && names.includes(callName);
}

function getCallName(callExpression: ts.CallExpression): string | undefined {
  const { expression } = callExpression;

  if (ts.isIdentifier(expression)) {
    return expression.text;
  }

  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name.text;
  }

  return undefined;
}

function getScriptKind(filePath: string): ts.ScriptKind {
  return filePath.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

function normalizeFilePath(filePath: string): string {
  return filePath.replaceAll(path.sep, "/");
}

function isPlaywrightFlakeLinterConfig(value: unknown): value is PlaywrightFlakeLinterConfig {
  if (!isRecord(value) || !isStringArray(value["scanRoots"])) {
    return false;
  }

  return (
    isOptionalString(value["specFilePattern"]) &&
    isOptionalString(value["identityNamePattern"]) &&
    isOptionalStringArray(value["hardenedIdentityHelperNames"]) &&
    isOptionalStringArray(value["responseWaitCallNames"]) &&
    isOptionalStringArray(value["retryHelperNames"]) &&
    isOptionalStringArray(value["specificRequestMatcherNames"]) &&
    isOptionalStringArray(value["transientClassifierNamePatterns"]) &&
    isOptionalStringArray(value["undiscriminatingRetryHelperNames"]) &&
    isOptionalNumberRecord(value["identityHelperMinimumLengths"]) &&
    isOptionalAllowlist(value["allowlist"]) &&
    isOptionalSharedReadinessMechanisms(value["sharedReadinessMechanisms"])
  );
}

function isOptionalAllowlist(
  value: unknown,
): value is readonly PlaywrightFlakeLinterAllowlistEntry[] | undefined {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.every(
        (entry: unknown) =>
          isRecord(entry) &&
          typeof entry["filePathPattern"] === "string" &&
          typeof entry["reason"] === "string" &&
          isPlaywrightFlakeRuleId(entry["ruleId"]),
      ))
  );
}

function isOptionalSharedReadinessMechanisms(
  value: unknown,
): value is readonly SharedReadinessMechanism[] | undefined {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.every(
        (mechanism: unknown) =>
          isRecord(mechanism) &&
          isStringArray(mechanism["directCallNames"]) &&
          typeof mechanism["filePathPattern"] === "string" &&
          typeof mechanism["name"] === "string" &&
          isStringArray(mechanism["sharedHelperNames"]),
      ))
  );
}

function isPlaywrightFlakeRuleId(value: unknown): value is PlaywrightFlakeRuleId {
  return typeof value === "string" && PLAYWRIGHT_FLAKE_RULE_ID_SET.has(value);
}

function isOptionalNumberRecord(
  value: unknown,
): value is Readonly<Record<string, number>> | undefined {
  return (
    value === undefined ||
    (isRecord(value) &&
      Object.values(value).every((entry) => typeof entry === "number" && Number.isFinite(entry)))
  );
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isOptionalStringArray(value: unknown): value is readonly string[] | undefined {
  return value === undefined || isStringArray(value);
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry: unknown) => typeof entry === "string");
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}
