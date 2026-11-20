import { PATH_TOKEN_PATTERN } from "./constants.ts";

export type PathTokenValues = Readonly<Record<string, number | string>>;

/** An asset or sidecar path with its `{token}` placeholders filled; unknown tokens stay as written. */
export const fillPathTokens = (path: string, values: PathTokenValues) =>
  path.replace(PATH_TOKEN_PATTERN, (token, name: string) => (name in values ? String(values[name]) : token));
