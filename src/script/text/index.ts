/** Quest text resolution and the catalog name bridge (QU2). Pure: no Lingui, no engine; safe for the server. */
export { contentDisplayName, type ContentNameRequest } from "./content-names.ts";
export type { QuestTextContext, QuestTextExprValue, TextCatalogPort } from "./context.ts";
export { formatSourceMessage, type MessageValues } from "./format.ts";
export { resolveQuestText } from "./resolve.ts";
