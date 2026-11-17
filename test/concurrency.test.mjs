import assert from "node:assert/strict";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { AsyncCaller } from "../lib/index.mjs";

test("caps concurrent calls while callbacks are pending", async () => {
  const caller = new AsyncCaller({ concurrency: 3 });
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  let active = 0;
  let peak = 0;

  const calls = Array.from({ length: 8 }, (_, index) => caller.call(async () => {
    active++;
    peak = Math.max(peak, active);
    await pending;
    active--;
    return index;
  }));

  await setImmediate();
  release();
  assert.deepEqual(await Promise.all(calls), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(peak, 3);
});

test("holds the slot during retries and lets the next call start after rejection", async () => {
  const caller = new AsyncCaller({
    concurrency: 1,
    customRetryDelayInMsCalculator: () => 0,
  });
  const rateLimit = Object.assign(new Error("Rate limited"), { status: 429 });
  const failure = Object.assign(new Error("Bad request"), { status: 400 });
  const starts = [];
  const first = caller.call(async () => {
    if (starts.length === 0) {
      starts.push("first attempt");
      throw rateLimit;
    }
    starts.push("retry");
    throw failure;
  });
  const rejected = assert.rejects(first, (error) => error === failure);
  const second = caller.call(async () => { starts.push("next call"); });

  await Promise.all([rejected, second]);
  assert.deepEqual(starts, ["first attempt", "retry", "next call"]);
});
