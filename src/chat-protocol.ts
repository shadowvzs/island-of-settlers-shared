import { isObject, isUuid } from "./validation.ts";

export type ChatChannel =
  | { kind: "world" | "trade" }
  | { kind: "guild"; guildId: string }
  | { kind: "direct"; peerId: string };
export interface ChatMessage {
  id: string;
  channelKey: string;
  authorId: string;
  displayName: string;
  body: string;
  createdAt: string;
  clientMessageId: string | null;
}
export type ChatCommand =
  | { type: "auth"; requestId: string; accessToken: string }
  | { type: "join" | "leave"; requestId: string; channel: ChatChannel }
  | { type: "typing"; requestId: string; channel: ChatChannel; isTyping: boolean }
  | {
      type: "report";
      requestId: string;
      channel: ChatChannel;
      messageId: string;
      reason: "spam" | "abuse" | "other";
      details?: string;
    }
  | {
      type: "history";
      requestId: string;
      channel: ChatChannel;
      before?: string;
      after?: string;
      limit?: number;
    }
  | {
      type: "send";
      requestId: string;
      channel: ChatChannel;
      body: string;
      clientMessageId: string;
    };
export const isChatCursor = (value: unknown): value is string =>
  typeof value === "string" &&
  /^(0|[1-9]\d{0,18})$/.test(value) &&
  BigInt(value) <= 9223372036854775807n;
export const parseChatChannel = (value: unknown): ChatChannel | null => {
  if (!isObject(value)) return null;
  if (["world", "trade"].includes(value.kind as string) && Object.keys(value).length === 1)
    return value as ChatChannel;
  if (value.kind === "guild" && Object.keys(value).length === 2 && isUuid(value.guildId))
    return { kind: "guild", guildId: value.guildId.toLowerCase() };
  if (value.kind === "direct" && Object.keys(value).length === 2 && isUuid(value.peerId))
    return { kind: "direct", peerId: value.peerId.toLowerCase() };
  return null;
};
export const parseChatCommand = (value: unknown): ChatCommand | null => {
  if (
    !isObject(value) ||
    typeof value.requestId !== "string" ||
    !/^[A-Za-z0-9_-]{1,64}$/.test(value.requestId)
  )
    return null;
  const allowed: Record<string, string[]> = {
    auth: ["accessToken"],
    join: ["channel"],
    leave: ["channel"],
    typing: ["channel", "isTyping"],
    report: ["channel", "messageId", "reason", "details"],
    history: ["channel", "before", "after", "limit"],
    send: ["channel", "body", "clientMessageId"]
  };
  const type = value.type;
  if (
    typeof type !== "string" ||
    !Object.hasOwn(allowed, type) ||
    Object.keys(value).some((key) => !["type", "requestId", ...allowed[type]!].includes(key))
  )
    return null;
  if (value.type === "auth")
    return typeof value.accessToken === "string" && value.accessToken.length <= 8192
      ? (value as ChatCommand)
      : null;
  const channel = parseChatChannel(value.channel);
  if (!channel) return null;
  if (
    value.type === "history" &&
    ((value.before !== undefined && !isChatCursor(value.before)) ||
      (value.after !== undefined && !isChatCursor(value.after)) ||
      (value.before !== undefined && value.after !== undefined) ||
      (value.limit !== undefined &&
        (!Number.isInteger(value.limit) || Number(value.limit) < 1 || Number(value.limit) > 50)))
  )
    return null;
  if (value.type === "typing" && typeof value.isTyping !== "boolean") return null;
  if (
    value.type === "report" &&
    (!isChatCursor(value.messageId) ||
      value.messageId === "0" ||
      !["spam", "abuse", "other"].includes(value.reason as string) ||
      (value.details !== undefined &&
        (typeof value.details !== "string" ||
          value.details.length > 500 ||
          /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value.details))))
  )
    return null;
  if (
    value.type === "send" &&
    (typeof value.body !== "string" ||
      value.body.trim().length < 1 ||
      value.body.length > 1000 ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value.body) ||
      !isUuid(value.clientMessageId))
  )
    return null;
  return { ...value, channel } as ChatCommand;
};

/** Routing key only: computing it never grants permission. Services must authorize before use. */
export const chatChannelKey = (channel: ChatChannel, accountId: string) => {
  if (channel.kind === "guild") return `guild:${channel.guildId}`;
  if (channel.kind === "direct") return `direct:${[accountId, channel.peerId].sort().join(":")}`;
  return channel.kind;
};
