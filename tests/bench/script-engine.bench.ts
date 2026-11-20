import { performance } from "node:perf_hooks";

import { ScriptEngine } from "../../src/script/engine/engine.ts";
import type { ScriptEmission } from "../../src/script/types/emission.ts";
import type { MapScript, ScriptTrigger } from "../../src/script/types/index.ts";
import { createEngine, createFakeWorld, increase, runTicks } from "../script-engine-fixtures.ts";
import { emptyScript, numberVariable, ref, trigger } from "../script-fixtures.ts";

/**
 * Script engine micro-benchmark (lane TRG2): 1000 trigger subscriptions (330 actor-variable instances, 330 catalog
 * types, 330 family paths, 10 catch-all), 10 000 emissions over 500 live ticks (20 per tick) on 500 species and
 * 10 000 handles, plus the cost of unsubscribed emissions and of ticks without events. Each case runs on
 * `actorKilled` (filters on the subject slot `victim`) and on `animalKilled` (the same filters on the non-subject
 * slot `victim`; its subject is the killer), so the second index on non-subject actor slots is measured too.
 * Run manually: `node tests/bench/script-engine.bench.ts` (not part of `npm test`).
 */

const SUBSCRIPTIONS = 1000;
const EMISSIONS = 10_000;
const TICKS = 500;
const ROUNDS = 5;

const speciesOf = (index: number) => `species${index % 50}`;

const INSTANCES = 330;
const TYPES = 330;
const FAMILIES = 330;

const subjectSlot = (index: number) => {
  if (index < INSTANCES) return { kind: "variable" as const, variable: ref("variable", `var-a${index}`) };
  if (index < INSTANCES + TYPES) {
    return { kind: "type" as const, type: { type: ref("content", `animal:${speciesOf(index)}`) } };
  }
  if (index < INSTANCES + TYPES + FAMILIES) {
    return { family: ref("family", `animal.${speciesOf(index)}`), kind: "family" as const };
  }
  return null;
};

type BenchKind = "actorKilled" | "animalKilled";

const benchTrigger = (index: number, kind: BenchKind): ScriptTrigger => trigger(`trigger-${index}`, {
  actions: [increase("s1", "var-count")], concurrency: "parallel",
  events: [{ kind, player: { kind: "any" }, slots: { victim: subjectSlot(index) } }]
});

const benchScript = (kind: BenchKind): MapScript => emptyScript({
  triggers: Array.from({ length: SUBSCRIPTIONS }, (_unused, index) => benchTrigger(index, kind)),
  variables: [numberVariable("var-count", "count"), ...Array.from({ length: INSTANCES }, (_unused, index) => ({
    id: `var-a${index}`, name: `a${index}`, type: "actor" as const,
    initial: { type: "actor" as const, value: [{ generation: 0, id: index * 30, space: "animal" as const }] }
  }))]
});

/** Emissions over 500 species keys and 10 000 handles: most hit nothing (realistic: most actors unreferenced). */
const emissionAt = (index: number, kind: BenchKind): ScriptEmission => {
  const species = `species${index % 500}`;
  return {
    actors: {
      killer: { family: "settler", handle: { generation: 0, id: 1, space: "actor" }, owner: 0, type: "settler:hunter" },
      victim: { family: `animal.${species}`, handle: { generation: 0, id: index, space: "animal" }, owner: null,
        type: `animal:${species}` }
    },
    kind
  };
};

const median = (samples: number[]) => [...samples].sort((a, b) => a - b)[Math.floor(samples.length / 2)]!;

/** Median and minimum of ROUNDS timed runs; `setup` (engine construction) is outside the timed part. */
const measure = <T>(label: string, setup: () => T, body: (subject: T) => void) => {
  const samples: number[] = [];
  for (let round = 0; round < ROUNDS; round++) {
    const subject = setup();
    const start = performance.now();
    body(subject);
    samples.push(performance.now() - start);
  }
  console.log(`${label}: median ${median(samples).toFixed(2)} ms, min ${Math.min(...samples).toFixed(2)} ms`);
};

const freshEngine = (kind: BenchKind) => () => {
  const world = createFakeWorld();
  const engine = createEngine(benchScript(kind), world);
  runTicks(engine, world, 1);
  return { engine, world };
};

const emitAndTick = ({ engine, world }: { engine: ScriptEngine; world: ReturnType<typeof createFakeWorld> },
  emissions: readonly ScriptEmission[]) => {
  const perTick = EMISSIONS / TICKS;
  for (let tick = 0; tick < TICKS; tick++) {
    for (let slot = 0; slot < perTick; slot++) engine.emit(emissions[tick * perTick + slot]!);
    runTicks(engine, world, 1);
  }
};

const runCase = (kind: BenchKind) => {
  console.log(`-- ${kind}`);
  const emissions = Array.from({ length: EMISSIONS }, (_unused, index) => emissionAt(index, kind));
  const unsubscribed = emissions.map(emission => ({ ...emission, kind: "bridgeCompleted" as const }));
  measure("build index (1000 triggers)", () => benchScript(kind), script => {
    createEngine(script, createFakeWorld());
  });
  measure(`${EMISSIONS} emissions + ${TICKS} ticks (delivery, firing, runs)`, freshEngine(kind),
    subject => emitAndTick(subject, emissions));
  measure(`${EMISSIONS} emissions of an unsubscribed kind`, freshEngine(kind), ({ engine }) => {
    for (const emission of unsubscribed) engine.emit(emission);
  });
  measure(`${TICKS} idle ticks (no events)`, freshEngine(kind), ({ engine, world }) => runTicks(engine, world, TICKS));
  const counted = freshEngine(kind)();
  emitAndTick(counted, emissions);
  console.log(`runs completed: ${counted.engine.state.values["var-count"]?.value}`);
};

const run = () => {
  runCase("actorKilled");
  runCase("animalKilled");
};

run();
