import * as net from "node:net";
import { domainToASCII } from "node:url";

export function normalizeRule(rule: string): string | undefined {
  const trimmed = rule.trim().toLowerCase().replace(/\.$/, "");
  if (trimmed.length === 0) {
    return undefined;
  }

  if (trimmed.startsWith("*.")) {
    const suffix = normalizeHost(trimmed.slice(2));
    if (suffix === undefined || net.isIP(suffix) !== 0) {
      return undefined;
    }

    return `*.${suffix}`;
  }

  return normalizeHost(trimmed);
}

export function normalizeRules(rules: readonly string[]): string[] {
  const normalizedRules: string[] = [];
  for (const rule of rules) {
    const normalizedRule = normalizeRule(rule);
    if (normalizedRule !== undefined) {
      normalizedRules.push(normalizedRule);
    }
  }

  return [...new Set(normalizedRules)];
}

export function parseList(input: string | undefined): string[] {
  if (input === undefined) {
    return [];
  }

  return input
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function normalizeHost(host: string): string | undefined {
  const trimmed = host.trim().toLowerCase().replace(/\.$/, "");
  const isBracketed = trimmed.startsWith("[") && trimmed.endsWith("]");
  const unbracketed = isBracketed ? trimmed.slice(1, -1) : trimmed;

  if (
    unbracketed.length === 0 ||
    unbracketed.includes("%") ||
    unbracketed.includes("/") ||
    /\s/.test(unbracketed)
  ) {
    return undefined;
  }

  if (net.isIP(unbracketed) !== 0) {
    return unbracketed;
  }

  // Brackets are reserved for IP literals; bracketed non-IPs are malformed.
  if (isBracketed) {
    return undefined;
  }

  if (unbracketed.includes(":") || unbracketed.includes("@")) {
    return undefined;
  }

  const ascii = domainToASCII(unbracketed);
  if (ascii.length === 0 || ascii.includes("*")) {
    return undefined;
  }

  return ascii;
}
