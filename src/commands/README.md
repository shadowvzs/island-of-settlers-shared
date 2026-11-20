# Recorded command manifest

One shared list of the settlement commands that are recorded, replayed and stored (UNIFY-B1, unification survey
§1). A command is a `SettlementSimulation` method a player (or a development tool) calls; everything that
records, replays, verifies or stores it reads its entry here.

| File | Contents |
|---|---|
| `command-manifest.ts` | `COMMAND_MANIFEST`: one entry per command, plain JSON data, in recording order |
| `command-args.ts` | named argument shapes built from the validation kit (`any`, `aiPlace`, `homeClaimConfirm`, `questClaim`, `roadDebugUpgrade`, road decoration transforms, `scriptUiAck`, `gameRulesAdopt`) |
| `home-claim-confirm-command.ts` | `HomeClaimConfirmCommand` and its shape: `confirmHomeClaim` (TRG7), a server-confirmed declared home reward leaves `pendingHomeClaims` |
| `quest-claim-command.ts` | `QuestClaimCommand` and its shape: the recorded quest claim `claimQuest` (TRG6) |
| `command-limits.ts` | `COMMAND_LOG_LIMITS` (512 commands per interval, 4 MiB per log, 64 intervals per upload, one day per interval), size classes, rate classes |
| `command-rules.ts` | derived sets and checks: `COMMAND_NAMES`, `DEVELOPMENT_COMMANDS`, `LEDGER_COMMANDS`, `WORLD_MUTATING_COMMANDS`, `recordedCommandProblem`, `knownCommandArgsValid`, `busiestCommandWindow` |

## Entry fields

| Field | Meaning | Read by |
|---|---|---|
| `access` | `player`, or `development` (Development tools and tests): an upload containing one needs the signed `admin` role; the production verifier refuses it | API upload check, client verifier |
| `args` | argument shape; `any` only requires an array | client verifier, bug replay, API upload check |
| `ledger` | moves value into or out of the island: the server always verifies its interval | API upload check |
| `mutatesWorld` | changes terrain, props or plots: the bug-replay scene journal observes the world after it | bug-replay recorder |
| `randomChoice` | a debug roll filled into argument `arg` before recording, so a replay repeats it | bug-replay recorder |
| `rateClass` | per-upload rate bound (`standard`: 600 commands per game minute) | API upload check |
| `sizeClass` | argument and recorded-result size bound (`standard`: 64 KiB / 16 KiB) | client recorders |

Every entry is recorded and replayed. Commands are not gated by island role here: the simulation and session
refuse a command on the wrong island (campaign, colony, home) and that refusal replays identically.

## Derived users

- Client `src/shared/settlement/settlement-commands.ts`: `REPLAY_COMMANDS` (checked at compile time against
  `SettlementSimulation`: every entry needs a handler), `ReplayCommandName` (the typed name of logged
  entries), argument and result copies, random debug rolls and `applyRecordedCommand` (the replay dispatch).
- Client recorders `bug-replay.ts` and `command-log.ts`; client verifier `command-log-replay.ts`.
- API `command-log-codec.ts` (shape, development, ledger and rate checks) and the archived relief proof bounds.

## Adding a command

1. Implement the handler and expose it on `SettlementSimulation` under the command name.
2. Add one entry to `COMMAND_MANIFEST`, at the end (the order is the recording order): `player()` or
   `development()`, with the flags that apply. A typed payload: add a shape to `command-args.ts` (kit checks;
   its refusal text becomes the verifier's mismatch reason) and name it in `args`.
3. Run `island-of-settlers-shared` `npm test` (update the golden list in `tests/command-manifest.test.ts`) and
   the client `tests/command-manifest.test.ts`, which fails when a simulation method is neither a manifest
   command nor listed there as a query or an unrecorded method.

Nothing else changes: the recorders wrap the new method, the verifier and bug replay accept it, the API stores it
and counts it in its classes. Renaming or removing an entry breaks stored logs and replay fixtures: keep a legacy
no-op handler instead (see `equipMilitary`).
