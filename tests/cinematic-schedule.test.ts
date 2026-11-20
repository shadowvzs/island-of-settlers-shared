import assert from "node:assert/strict";
import test from "node:test";

import { DIALOGUE_SPEED_MS_PER_CHAR, SPEAK_MAX_MS, SPEAK_MIN_MS } from "../src/campaign/cinematics/constants.ts";
import {
  scheduleSequence, sequenceDurationMs, stepDurationMs
} from "../src/campaign/cinematics/schedule.ts";
import {
  autoDurationMs, pageSpeakText, speakCharacterCount, speakDurationMs
} from "../src/campaign/cinematics/speak-timing.ts";
import type { CinematicStepOf } from "../src/campaign/cinematics/types.ts";
import { ADVISOR_LINE, ADVISOR_LINE_HU, ownerExampleSteps } from "./cinematic-fixtures.ts";

const speak = (text: string, overrides: Partial<CinematicStepOf<"speak">> = {}): CinematicStepOf<"speak"> => ({
  delayMs: 0, id: "line", kind: "speak", speakerId: "advisor", start: "afterPrevious", text: { en: text },
  timing: "auto", ...overrides
});

test("the owner example schedules to the exact table of plan section 2.5", () => {
  assert.equal(ADVISOR_LINE.length, 44);
  const speakMs = 2000 + 60 * 44;
  const speakEnd = 5500 + speakMs;
  const weatherEnd = speakEnd + 1000 + 3000;
  const expected = [
    { endMs: 500, startMs: 0 },
    { endMs: 3500, startMs: 1500 },
    { endMs: 4500, startMs: 4500 },
    { endMs: speakEnd, startMs: 5500 },
    { endMs: speakEnd + 1000, startMs: speakEnd + 1000 },
    { endMs: weatherEnd, startMs: speakEnd + 1000 },
    { endMs: weatherEnd + 1000 + 9000, startMs: weatherEnd + 1000 },
    { endMs: weatherEnd + 10_500, startMs: weatherEnd + 10_000 }
  ];
  const timings = scheduleSequence(ownerExampleSteps());
  assert.deepEqual(timings, expected);
  assert.equal(sequenceDurationMs(timings), 24_640);
});

test("speak steps are timed per language and by the dialogue-speed setting", () => {
  const steps = ownerExampleSteps();
  const hu = scheduleSequence(steps, { language: "hu" });
  assert.equal(hu[3]?.endMs, 5500 + 2000 + 60 * speakCharacterCount(ADVISOR_LINE_HU));
  const fast = scheduleSequence(steps, { msPerChar: DIALOGUE_SPEED_MS_PER_CHAR.fast });
  assert.equal(fast[3]?.endMs, 5500 + 2000 + 45 * 44);
  const missing = scheduleSequence(steps, { language: "de" });
  assert.deepEqual(missing, scheduleSequence(steps));
});

test("with-previous steps start from the previous start, and runtime durations re-anchor later steps", () => {
  const steps = ownerExampleSteps();
  const timings = scheduleSequence(steps, { actualDurationsMs: new Map([["s2", 500]]) });
  assert.deepEqual(timings[1], { endMs: 2000, startMs: 1500 });
  assert.equal(timings[2]?.startMs, 3000);
  const parallel = scheduleSequence([{ ...speak("Hi"), delayMs: 300, start: "withPrevious" }]);
  assert.deepEqual(parallel, [{ endMs: 300 + SPEAK_MIN_MS, startMs: 300 }]);
});

test("intrinsic durations: walk waits only for arrival, instant steps take no time, music never blocks", () => {
  const walk = { actorRef: "bandit", delayMs: 0, id: "w", kind: "walk", regionId: "area-gate",
    start: "afterPrevious", timeoutMs: 8000 } as const;
  assert.equal(stepDurationMs({ ...walk, waitUntilArrived: true }), 8000);
  assert.equal(stepDurationMs({ ...walk, waitUntilArrived: false }), 0);
  assert.equal(stepDurationMs({ delayMs: 0, fadeMs: 2000, id: "m", kind: "music", start: "afterPrevious",
    trackId: null }), 0);
  assert.equal(stepDurationMs({ delayMs: 0, hour: 20, id: "t", kind: "timeOfDay", start: "afterPrevious" }), 0);
  assert.equal(stepDurationMs({ delayMs: 0, durationMs: 700, id: "f", kind: "fade", start: "afterPrevious",
    to: "black" }), 700);
});

test("auto duration is 2 s + 60 ms per trimmed character, clamped to 2.5–12 s", () => {
  assert.equal(autoDurationMs("  Hi  "), SPEAK_MIN_MS);
  assert.equal(autoDurationMs("x".repeat(20)), 3200);
  assert.equal(autoDurationMs("x".repeat(200)), SPEAK_MAX_MS);
  assert.equal(autoDurationMs("árvíztűrő"), 2000 + 60 * 9);
  assert.equal(speakDurationMs(speak("ignored", { durationMs: 1234, timing: "fixed" }), "en"), 1234);
});

test("lines above 140 characters are paged at sentence boundaries, each page with its own duration", () => {
  const first = `${"a".repeat(80)}.`, second = `${"b".repeat(70)}!`, third = "Short one?";
  const pages = pageSpeakText(`${first} ${second} ${third}`);
  assert.deepEqual(pages, [first, `${second} ${third}`]);
  assert.equal(speakDurationMs(speak(`${first} ${second} ${third}`), "en"),
    autoDurationMs(first) + autoDurationMs(`${second} ${third}`));
  assert.deepEqual(pageSpeakText("   "), []);
  assert.deepEqual(pageSpeakText("Fits on one page."), ["Fits on one page."]);
});

test("over-long sentences break at words, and an over-long word by characters", () => {
  const words = Array.from({ length: 30 }, (_, index) => `word${index}`).join(" ");
  const pages = pageSpeakText(words);
  assert.ok(pages.length > 1);
  assert.ok(pages.every(page => speakCharacterCount(page) <= 140));
  assert.equal(pages.join(" "), words);
  assert.deepEqual(pageSpeakText("z".repeat(300)).map(page => page.length), [140, 140, 20]);
});
