/** One refusal: a code, the path into the checked value (`map.regions[3].name`) and an English message. */
export interface ValidationIssue<Code extends string = string> {
  code: Code;
  message: string;
  path: string;
}

/** Where checks report; every check appends instead of throwing. */
export interface IssueSink<Code extends string = string> {
  add: (code: Code, path: string, message: string) => void;
}

export interface IssueCollector<Code extends string> extends IssueSink<Code> {
  issues: ValidationIssue<Code>[];
}

export const createIssueCollector = <Code extends string>(): IssueCollector<Code> => {
  const issues: ValidationIssue<Code>[] = [];
  return { add: (code, path, message) => { issues.push({ code, message, path }); }, issues };
};

/** `path.key`, or `key` at the root. */
export const fieldPath = (path: string, key: string) => (path ? `${path}.${key}` : key);

export const indexPath = (path: string, index: number) => `${path}[${index}]`;
