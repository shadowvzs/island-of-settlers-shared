import type { PlayerInventory } from "./player-inventory.ts";

export interface CommanderRecoveryRequest {
  commanderId:string;
  idempotencyKey:string;
  revision:number;
  slotId:string;
}
export interface CommanderRecoveryReceipt {
  commanderId:string;
  revision:number;
  slotId:string;
  /** Null when the slot has advanced beyond the receipt: reload authoritative state, never roll back. */
  settlement:unknown;
  wallet:{ gems:number;items:PlayerInventory };
}
