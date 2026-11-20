import { resolveTranslatableText } from "../campaign/campaign-text.ts";
import { SCRIPT_ISSUE_MESSAGES, type ScriptIssueCode } from "./issue-messages.ts";

export { SCRIPT_ISSUE_MESSAGES, type ScriptIssueCode } from "./issue-messages.ts";

/**
 * Structured Ready-check results of the map script (trigger design §11.1). Errors make the map a draft (save
 * anyway, owner answer 1); warnings and info notes never block.
 */
export type ScriptIssueSeverity = "error" | "warning" | "info";
export type ScriptIssueParams = Readonly<Record<string, string | number>>;

export interface ScriptIssue {
  code: ScriptIssueCode;
  params: ScriptIssueParams;
  path: string;
  severity: ScriptIssueSeverity;
}

export interface ScriptValidationResult {
  errors: ScriptIssue[];
  infos: ScriptIssue[];
  /** True when there is no error. */
  ready: boolean;
  /** Derived header flag: the script reads or writes hour/weather (Settings controls disabled, §6.11). */
  scriptReadsEnvironment: boolean;
  warnings: ScriptIssue[];
}

/** Where every check reports. */
export interface ScriptIssueSink {
  add: (severity: ScriptIssueSeverity, code: ScriptIssueCode, path: string, params?: ScriptIssueParams) => void;
  issues: ScriptIssue[];
}

export const createScriptIssueSink = (): ScriptIssueSink => {
  const issues: ScriptIssue[] = [];
  return {
    add: (severity, code, path, params = {}) => { issues.push({ code, params, path, severity }); },
    issues
  };
};

export const scriptValidationResult = (
  issues: readonly ScriptIssue[], scriptReadsEnvironment: boolean
): ScriptValidationResult => {
  const errors = issues.filter(issue => issue.severity === "error");
  return {
    errors,
    infos: issues.filter(issue => issue.severity === "info"),
    ready: errors.length === 0,
    scriptReadsEnvironment,
    warnings: issues.filter(issue => issue.severity === "warning")
  };
};

/** The issue's message in `language` (English fallback), with `{name}` placeholders filled. */
export const formatScriptIssue = (issue: ScriptIssue, language: string) => {
  const template = resolveTranslatableText(SCRIPT_ISSUE_MESSAGES[issue.code], language);
  const values: ScriptIssueParams = { ...issue.params, path: issue.path };
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => String(values[name] ?? placeholder));
};
