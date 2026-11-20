import { arrayOf, type Check, guard, integer, objectOf, recordOf, string } from "../validation/schema.ts";

/**
 * The recorded confirmation of a declared home reward claim (TRG7, trigger design §4.14, §9.4 step 5): the server
 * ledger accepted `{ rewardId, occurrence }`, so the island drops it from `pendingHomeClaims` and stores the goods
 * the ledger named at home. One command per confirmed claim, so replay and verifier shrink the queue at the same
 * tick; a confirmation of a claim that is not pending is refused (and pays nothing).
 */
export interface HomeClaimConfirmCommand {
  /** Coins and wares the server's ledger paid (stored at home on the home island). */
  goods: Readonly<Record<string, number>>;
  occurrence: string;
  rewardId: string;
}

const ID_LENGTH = 120;
const GOODS_ENTRIES = 64;

const confirmation = objectOf({
  goods: recordOf(integer(0), { maxEntries: GOODS_ENTRIES }),
  occurrence: string({ maxLength: ID_LENGTH, minLength: 1 }),
  rewardId: string({ maxLength: ID_LENGTH, minLength: 1 })
});

const oneArgument = guard(args => Array.isArray(args) && args.length === 1, "Exactly one confirmation is required");

const confirmationList = arrayOf(confirmation, 1);

/** The command's whole argument array: exactly one confirmation object. */
export const homeClaimConfirmArgs: Check = (value, path, sink) => {
  oneArgument(value, path, sink);
  confirmationList(value, path, sink);
};
