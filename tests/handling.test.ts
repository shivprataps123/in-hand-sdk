/**
 * WHAT IS THIS FILE?
 * ------------------
 * The tests for the "is the phone in a hand?" decision.
 *
 * WHY DOES IT EXIST?
 * -------------------
 * These tests build pretend recordings of the phone (lying on a table, being shaken,
 * being picked up, being held) and check that the SDK gives the right answer for each
 * one. That way the rules can be changed safely: if a change breaks a rule, a test
 * fails and says exactly which situation got broken.
 *
 * HOW DO I RUN THEM?
 * ------------------
 *   npx vitest run
 *
 * NOTE ON THE FAKE DATA
 * ---------------------
 * The numbers below imitate a phone's accelerometer, which reports "g" (1 g is the
 * pull of gravity). A phone lying flat on a table reads about 1 g straight down the
 * screen axis, which is why the flat examples below use z = 1.
 */

import { describe, expect, it } from "vitest";

import { classifyHandling, summarizeMotion } from "../src/classifier";
import { computeHandlingFeatures, tiltFromFlat } from "../src/features";
import type { MotionSample } from "../src/types";

/** How often the pretend phone reports a reading, in milliseconds. */
const INTERVAL_MS = 20;

/** A fixed starting point in time, so the tests always produce the same numbers. */
const START_TIME = 1_700_000_000_000;

/**
 * Builds a recording of `durationMs` long, where each reading comes from the
 * `valueAt` function (it is given the time of the reading in milliseconds).
 */
function makeRecording(
  durationMs: number,
  valueAt: (timeMs: number) => { x: number; y: number; z: number }
): MotionSample[] {
  const count = Math.floor(durationMs / INTERVAL_MS);
  const samples: MotionSample[] = [];

  for (let index = 0; index < count; index += 1) {
    const timeMs = index * INTERVAL_MS;

    samples.push({ ...valueAt(timeMs), timestamp: START_TIME + timeMs });
  }

  return samples;
}

/** The same, but for the gyroscope (how fast the phone turns). */
function makeSpin(
  durationMs: number,
  spinAt: (timeMs: number) => { x: number; y: number; z: number }
): MotionSample[] {
  return makeRecording(durationMs, spinAt);
}

/**
 * A phone lying flat on a table. It reads 1 g straight down the screen axis and
 * wobbles by a tiny amount, the way a real phone's sensor does.
 */
function lyingOnTable(durationMs = 2500): MotionSample[] {
  return makeRecording(durationMs, (timeMs) => ({
    x: 0.002 * Math.sin(timeMs / 40),
    y: 0.002 * Math.sin(timeMs / 55),
    z: 1
  }));
}

/**
 * A phone lying on a table that is being shaken. The phone moves a lot, but it stays
 * flat, so gravity still pulls in exactly the same direction.
 */
function shakenOnTable(durationMs = 2500): MotionSample[] {
  return makeRecording(durationMs, (timeMs) => ({
    x: 0.45 * Math.sin((2 * Math.PI * 5 * timeMs) / 1000),
    y: 0.2 * Math.sin((2 * Math.PI * 7 * timeMs) / 1000),
    z: 1
  }));
}

/**
 * A phone lying on a table that gets a notification buzz. The buzz is short and
 * everything else is perfectly still.
 */
function notificationBuzz(durationMs = 2500): MotionSample[] {
  return makeRecording(durationMs, (timeMs) => {
    const buzzing = timeMs > 1000 && timeMs < 1200;

    return {
      x: buzzing ? 0.6 * Math.sin((2 * Math.PI * 40 * timeMs) / 1000) : 0.001,
      y: buzzing ? 0.3 * Math.sin((2 * Math.PI * 35 * timeMs) / 1000) : 0.001,
      z: 1
    };
  });
}

/**
 * A phone held in a hand, tilted at 45 degrees and being moved gently.
 * The hand is never perfectly still, so the readings wobble a little.
 */
function heldInHand(durationMs = 2500): MotionSample[] {
  const gravity = { x: 0, y: -Math.SQRT1_2, z: Math.SQRT1_2 };

  return makeRecording(durationMs, (timeMs) => ({
    x: gravity.x + 0.05 * Math.sin((2 * Math.PI * 2 * timeMs) / 1000),
    y: gravity.y + 0.05 * Math.sin((2 * Math.PI * 3 * timeMs) / 1000),
    z: gravity.z + 0.05 * Math.sin((2 * Math.PI * 2.5 * timeMs) / 1000)
  }));
}

/**
 * A phone that starts on a table and is picked up half way through the recording.
 * The direction of gravity inside the phone turns as it is lifted.
 */
function pickedUp(durationMs = 2500): MotionSample[] {
  const target = { x: 0, y: -Math.SQRT1_2, z: Math.SQRT1_2 };
  const pickUpStart = 500;
  const pickUpEnd = 800;

  return makeRecording(durationMs, (timeMs) => {
    // 0 while it lies on the table, 1 once it is fully in the hand.
    const progress =
      timeMs <= pickUpStart
        ? 0
        : timeMs >= pickUpEnd
          ? 1
          : (timeMs - pickUpStart) / (pickUpEnd - pickUpStart);

    const base = {
      x: target.x * progress,
      y: target.y * progress,
      z: 1 + (target.z - 1) * progress
    };

    return {
      x: base.x + 0.05 * Math.sin((2 * Math.PI * 3 * timeMs) / 1000),
      y: base.y + 0.05 * Math.sin((2 * Math.PI * 2 * timeMs) / 1000),
      z: base.z + 0.05 * Math.sin((2 * Math.PI * 2.5 * timeMs) / 1000)
    };
  });
}

/**
 * A phone that is picked up and then put back down on the table again.
 */
function pickedUpAndPutBack(durationMs = 2500): MotionSample[] {
  const target = { x: 0, y: -Math.SQRT1_2, z: Math.SQRT1_2 };
  const pickUpStart = 400;
  const pickUpEnd = 700;
  const putBackStart = 1600;
  const putBackEnd = 1900;

  return makeRecording(durationMs, (timeMs) => {
    let progress = 0;

    if (timeMs > pickUpStart && timeMs < pickUpEnd) {
      progress = (timeMs - pickUpStart) / (pickUpEnd - pickUpStart);
    } else if (timeMs >= pickUpEnd && timeMs < putBackStart) {
      progress = 1;
    } else if (timeMs >= putBackStart && timeMs < putBackEnd) {
      progress = 1 - (timeMs - putBackStart) / (putBackEnd - putBackStart);
    }

    return {
      x:
        target.x * progress +
        0.04 * Math.sin((2 * Math.PI * 3 * timeMs) / 1000),
      y:
        target.y * progress +
        0.04 * Math.sin((2 * Math.PI * 2 * timeMs) / 1000),
      z: 1 + (target.z - 1) * progress
    };
  });
}

/** Runs the whole SDK over a pretend recording and returns the verdict. */
function judge(accelerometer: MotionSample[], gyroscope: MotionSample[] = []) {
  const summary = summarizeMotion(accelerometer, gyroscope);

  return classifyHandling(summary.features!);
}

describe("deciding whether a phone is in a hand", () => {
  it("rejects a phone lying still on a table", () => {
    const result = judge(lyingOnTable());

    expect(result.verified).toBe(false);
    expect(result.status).toBe("likely_resting");
    expect(result.checks.notResting).toBe(false);
  });

  it("rejects a phone that is shaken on a table", () => {
    const result = judge(shakenOnTable());

    expect(result.verified).toBe(false);
    // The phone moved, but it never changed direction, and it is still flat.
    expect(result.checks.reoriented).toBe(false);
    expect(result.checks.notResting).toBe(false);
  });

  it("rejects a phone that only buzzes from a notification", () => {
    const result = judge(notificationBuzz());

    expect(result.verified).toBe(false);
    expect(result.status).toBe("likely_resting");
  });

  it("accepts a phone that is picked up and held", () => {
    const result = judge(pickedUp());

    expect(result.verified).toBe(true);
    expect(result.status).toBe("likely_handled");
    expect(result.checks.notResting).toBe(true);
    expect(result.checks.reoriented).toBe(true);
    expect(result.checks.continuous).toBe(true);
  });

  it("accepts a phone that is already in a hand and keeps moving", () => {
    const result = judge(heldInHand());

    expect(result.verified).toBe(true);
    expect(result.status).toBe("likely_handled");
  });

  it("rejects a phone that is picked up and then put back down", () => {
    const result = judge(pickedUpAndPutBack());

    expect(result.verified).toBe(false);
    // It ends up flat on the table again.
    expect(result.checks.notResting).toBe(false);
  });

  it("accepts a phone that is picked up and turned, using the gyroscope", () => {
    const gyroscope = makeSpin(2500, (timeMs) => ({
      x: 0,
      y: 0,
      z: timeMs > 500 ? 1.2 : 0
    }));

    const result = judge(pickedUp(), gyroscope);

    expect(result.verified).toBe(true);
  });
});

describe("the measurements behind the decision", () => {
  it("reports a phone on a table as flat", () => {
    const features = computeHandlingFeatures(lyingOnTable(), []);

    expect(features.currentTiltDeg).toBeLessThan(10);
    expect(features.orientationChangeDeg).toBeLessThan(10);
  });

  it("reports a phone in a hand as tilted", () => {
    const features = computeHandlingFeatures(heldInHand(), []);

    // The pretend phone is held at 45 degrees.
    expect(features.currentTiltDeg).toBeGreaterThan(35);
    expect(features.currentTiltDeg).toBeLessThan(55);
  });

  it("reports a big direction change when the phone is picked up", () => {
    const features = computeHandlingFeatures(pickedUp(), []);

    expect(features.orientationChangeDeg).toBeGreaterThan(20);
  });

  it("reports almost no direction change when the phone is shaken on a table", () => {
    const features = computeHandlingFeatures(shakenOnTable(), []);

    expect(features.orientationChangeDeg).toBeLessThan(20);
  });

  it("reports a short buzz as a small share of movement", () => {
    const features = computeHandlingFeatures(notificationBuzz(), []);

    expect(features.dutyCycle).toBeLessThan(0.2);
  });

  it("reports continuous movement when the phone is held and moved", () => {
    const features = computeHandlingFeatures(heldInHand(), []);

    expect(features.dutyCycle).toBeGreaterThan(0.2);
    expect(features.activeDurationMs).toBeGreaterThan(300);
  });
});

describe("the small maths helpers", () => {
  it("treats a phone lying flat as zero degrees of tilt", () => {
    expect(tiltFromFlat({ x: 0, y: 0, z: 1 })).toBeCloseTo(0);
    expect(tiltFromFlat({ x: 0, y: 0, z: -1 })).toBeCloseTo(0);
  });

  it("treats a phone standing on its edge as ninety degrees of tilt", () => {
    expect(tiltFromFlat({ x: 1, y: 0, z: 0 })).toBeCloseTo(90);
    expect(tiltFromFlat({ x: 0, y: 1, z: 0 })).toBeCloseTo(90);
  });
});
