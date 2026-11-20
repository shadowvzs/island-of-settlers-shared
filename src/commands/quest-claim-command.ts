import { arrayOf, boolean, type Check, guard, integer, objectOf, recordOf, string } from "../validation/schema.ts";

/**
 * The recorded quest claim (TRG6, trigger design §9.1, QU §7.4): one settlement command per claim, so a replay and
 * the verifier apply the claim's cost and reward goods at the same tick. Shared by the client simulation, the
 * manifest's argument shape and the API upload check.
 */
export interface QuestClaimCommand {
  /** The quest book (`home-default`, a map book id, `colony-<expedition>`, `campaign-<id>-<map>`). */
  bookId: string;
  /** Goods taken from the island stock (owner 41: every map kind); empty when skipped. */
  cost: Readonly<Record<string, number>>;
  /** Reward goods stored at home (the session's amounts, or the server ledger's confirmed goods). */
  goods: Readonly<Record<string, number>>;
  /** The claim occurrence (`0` for once, the window index for repeats, the daily ledger day key). */
  occurrence: string;
  questId: string;
  skip: boolean;
}

const ID_LENGTH = 120;
const GOODS_ENTRIES = 64;

const goods = recordOf(integer(0), { maxEntries: GOODS_ENTRIES });
const identifier = string({ maxLength: ID_LENGTH, minLength: 1 });

const claim = objectOf({
  bookId: identifier, cost: goods, goods, occurrence: string({ maxLength: ID_LENGTH, minLength: 1 }),
  questId: identifier, skip: boolean
});

const oneArgument = guard(args => Array.isArray(args) && args.length === 1, "Exactly one claim is required");
const claimList = arrayOf(claim, 1);

/** The command's whole argument array: exactly one claim object. */
export const questClaimArgs: Check = (value, path, sink) => {
  oneArgument(value, path, sink);
  claimList(value, path, sink);
};
