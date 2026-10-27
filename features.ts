/**
 * WHAT IS THIS FILE?
 * ------------------
 * This file turns a raw recording from the phone's sensors into a set of simple,
 * human-meaningful measurements ("features").
 *
 * WHY DOES IT EXIST?
 * -------------------
 * The old version of the SDK asked a single question: "did the phone move?".
 * That is not enough, because a phone lying on a table that gets a notification, or
 * that the user shakes, also moves.
 *
 * The trick is that a phone lying on a table and a phone held in a hand look
 * completely different *in terms of direction*:
 *
 *   - On a table: the phone stays flat. Gravity keeps pulling in the same direction
 *     inside the phone, no matter how much the phone is shaken.
 *   - In a hand: the phone is tilted and the wrist keeps adjusting, so the direction
 *     of gravity inside the phone changes and keeps changing.
 *
 * So this file measures three things:
 *   1. How tilted is the phone right now?            -> "is it lying flat on a table?"
 *   2. How much did the direction change?            -> "was it picked up and turned?"
 *   3. How much of the time was it actually moving?  -> "was it a long movement or a buzz?"
 *
 * HOW DO I USE IT?
 * -----------------
 * Normally you do not call anything in here directly. `verifyPhoneInHand()` does it
 * for you. It is kept separate, and free of any sensor imports, so that it can be
 * tested with made-up data (see the `tests` folder).
 */

import { DEFAULT_THRESHOLDS } from "./thresholds";
import type { HandlingFeatures, MotionSample, Thresholds } from "./types";

/** How many degrees are in one radian. */
const DEG_PER_RAD = 180 / Math.PI;

/**
 * The axis that points out of the phone's screen.
 *
 * The accelerometer reads about 1 g along this axis when the phone lies flat on a
 * table (screen up) or face down (screen down). That makes this axis the best way to
 * ask "is the phone lying flat on a surface?".
 */
const SCREEN_AXIS = { x: 0, y: 0, z: 1 };

/** A simple 3D vector. */
interface Vector3 {
  x: number;
  y: number;
  z: number;
}

/**
 * One short piece of the recording (by default 200 ms long).
 *
 * The SDK chops the recording into pieces like this so it can look at each piece on
 * its own. That matters because a recording can contain a phone lying still, then a
 * pick-up, then a phone being held - and those need to be judged separately.
 */
interface Segment {
  /** The piece of the recording this describes. */
  index: number;

  /** Where this piece starts in the list of readings (inclusive). */
  startIndex: number;

  /** Where this piece ends in the list of readings (exclusive). */
  endIndex: number;

  /**
   * Where gravity was pulling inside the phone, as a unit vector.
   * `null` when the phone was in free fall and the reading could not be trusted.
   */
  gravity: Vector3 | null;

  /** The same value before it was turned into a unit vector (about 1 g normally). */
  gravityRaw: Vector3;

  /**
   * How tilted the phone was during this piece, in degrees.
   * 0 = lying flat on a table, 90 = standing upright.
   */
  tiltFromFlatDeg: number;

  /** How much the phone moved around inside this piece, in "g". */
  activityG: number;

  /** True when the piece was calm enough to trust the gravity reading. */
  isQuiet: boolean;

  /** False when the phone was in free fall and the piece cannot be trusted at all. */
  isValid: boolean;
}

/** Length of a vector. */
function magnitude(vector: Vector3): number {
  return Math.sqrt(vector.x ** 2 + vector.y ** 2 + vector.z ** 2);
}

/** Vector a minus vector b. */
function subtract(a: Vector3, b: Vector3): Vector3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

/** Turns a vector into a unit vector (length 1). Returns null if it has no length. */
function normalize(vector: Vector3): Vector3 | null {
  const length = magnitude(vector);

  if (length < 1e-6) return null;

  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

/** The "dot product": how much two vectors point in the same direction. */
function dot(a: Vector3, b: Vector3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/**
 * The angle between two vectors, in degrees (0 to 180).
 * 0 degrees means "pointing exactly the same way".
 */
export function angleBetweenDeg(a: Vector3, b: Vector3): number {
  const similarity = Math.max(-1, Math.min(1, dot(a, b)));

  return Math.acos(similarity) * DEG_PER_RAD;
}

/**
 * How tilted the phone is, in degrees, given the direction of gravity.
 *
 * 0 degrees  -> the phone is lying flat (screen up or screen down): a table.
 * 90 degrees -> the phone is standing up on its edge: a hand.
 *
 * The phone's screen axis is used as the reference, because that is the direction a
 * phone rests in when it is put down on a table.
 */
export function tiltFromFlat(gravity: Vector3): number {
  const angleToScreen = angleBetweenDeg(gravity, SCREEN_AXIS);

  // Gravity may point out of the screen (screen up) or into it (screen down).
  // Both count as "lying flat", so we take the smaller of the two angles.
  return Math.min(angleToScreen, 180 - angleToScreen);
}

/**
 * The average of a list of numbers, ignoring the highest and lowest tenth.
 *
 * Why ignore the extremes? Because a single notification buzz can produce one wild
 * reading. Averaging everything together would let that one reading drag the
 * average around and give us the wrong idea of which way gravity is pulling.
 */
export function trimmedMean(values: number[], trimRatio = 0.1): number {
  if (values.length === 0) return 0;

  if (values.length < 5) {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const trimCount = Math.floor(sorted.length * trimRatio);
  const kept = sorted.slice(trimCount, sorted.length - trimCount);

  return kept.reduce((sum, value) => sum + value, 0) / kept.length;
}

/** The average of each axis of a set of readings, ignoring the extremes. */
function trimmedMeanVector(samples: MotionSample[]): Vector3 {
  return {
    x: trimmedMean(samples.map((sample) => sample.x)),
    y: trimmedMean(samples.map((sample) => sample.y)),
    z: trimmedMean(samples.map((sample) => sample.z))
  };
}

/**
 * Cuts the recording into short pieces of roughly `segmentDurationMs` milliseconds.
 */
function buildSegments(
  samples: MotionSample[],
  segmentDurationMs: number,
  thresholds: Thresholds
): Segment[] {
  if (samples.length === 0) return [];

  const ordered = [...samples].sort((a, b) => a.timestamp - b.timestamp);
  const buckets: MotionSample[][] = [];
  const ranges: { startIndex: number; endIndex: number }[] = [];

  let current: MotionSample[] = [];
  let currentStart = ordered[0].timestamp;
  let currentStartIndex = 0;

  for (let index = 0; index < ordered.length; index += 1) {
    const sample = ordered[index];

    if (
      current.length > 0 &&
      sample.timestamp - currentStart >= segmentDurationMs
    ) {
      buckets.push(current);
      ranges.push({ startIndex: currentStartIndex, endIndex: index });
      current = [];
      currentStart = sample.timestamp;
      currentStartIndex = index;
    }

    current.push(sample);
  }

  if (current.length > 0) {
    buckets.push(current);
    ranges.push({ startIndex: currentStartIndex, endIndex: ordered.length });
  }

  return buckets.map((bucket, index) => {
    const gravityRaw = trimmedMeanVector(bucket);
    const gravityMagnitude = magnitude(gravityRaw);

    // Below roughly half a g the phone is in free fall (being thrown or dropped).
    // In that situation the direction of gravity cannot be trusted at all.
    const isValid = gravityMagnitude > 0.5;
    const gravity = isValid ? normalize(gravityRaw) : null;

    // How far the readings stray from this piece's own gravity estimate.
    // A calm piece stays very close; a shaking piece strays a lot.
    const activityG =
      bucket.reduce(
        (sum, sample) => sum + magnitude(subtract(sample, gravityRaw)),
        0
      ) / bucket.length;

    return {
      index,
      startIndex: ranges[index].startIndex,
      endIndex: ranges[index].endIndex,
      gravity,
      gravityRaw,
      tiltFromFlatDeg: gravity ? tiltFromFlat(gravity) : 90,
      activityG,
      isQuiet: isValid && activityG <= thresholds.quietThresholdG,
      isValid
    };
  });
}

/**
 * Works out how much of the recording was spent actually moving.
 *
 * Every reading is compared with the gravity estimate of its own piece, so a phone
 * that is picked up and turned is not mistaken for "violent shaking".
 *
 * Returns:
 *   dutyCycle        - the share of readings that counted as movement (0 to 1)
 *   activeDurationMs - roughly how many milliseconds of movement there was
 */
function measureContinuity(
  samples: MotionSample[],
  segments: Segment[],
  thresholds: Thresholds
): { dutyCycle: number; activeDurationMs: number } {
  if (samples.length === 0) return { dutyCycle: 0, activeDurationMs: 0 };

  const ordered = [...samples].sort((a, b) => a.timestamp - b.timestamp);

  // Work out the typical gap between two readings, so we can convert a count of
  // readings into milliseconds.
  const gaps: number[] = [];

  for (let i = 1; i < ordered.length; i += 1) {
    const gap = ordered[i].timestamp - ordered[i - 1].timestamp;

    if (gap > 0 && gap < 1000) gaps.push(gap);
  }

  const typicalGapMs =
    gaps.length > 0 ? trimmedMean(gaps) : thresholds.segmentDurationMs;

  // A rough reference for the whole recording, used for pieces we cannot trust.
  const overallGravity = trimmedMeanVector(ordered);

  let movingCount = 0;

  for (const segment of segments) {
    for (let i = segment.startIndex; i < segment.endIndex; i += 1) {
      // Compare the reading with the gravity estimate of its own piece. Using the
      // piece's own estimate means a phone that is picked up and turned is not
      // mistaken for violent shaking.
      const reference = segment.isValid ? segment.gravityRaw : overallGravity;
      const deviation = magnitude(subtract(ordered[i], reference));

      if (deviation > thresholds.motionThresholdG) movingCount += 1;
    }
  }

  return {
    dutyCycle: movingCount / ordered.length,
    activeDurationMs: movingCount * typicalGapMs
  };
}

/**
 * Adds up every bit of turning the phone did, using the gyroscope.
 *
 * This is a second, independent way of noticing that the phone was picked up and
 * turned. Shaking a phone on a table rolls it back and forth and produces far less
 * total turning than a pick-up does.
 */
export function measureRotationPath(gyroscope: MotionSample[]): number {
  if (gyroscope.length < 2) return 0;

  const ordered = [...gyroscope].sort((a, b) => a.timestamp - b.timestamp);
  let pathRadians = 0;

  for (let i = 1; i < ordered.length; i += 1) {
    // The gap between readings, capped at 200 ms so a dropped reading cannot create
    // a huge fake jump.
    const gapMs = Math.max(
      0,
      Math.min(200, ordered[i].timestamp - ordered[i - 1].timestamp)
    );
    const seconds = gapMs / 1000;

    const spin = magnitude(ordered[i]);

    pathRadians += spin * seconds;
  }

  return pathRadians * DEG_PER_RAD;
}

/**
 * The old, simple measurements (average shake and average spin).
 * They are still reported because they are useful when tuning the thresholds.
 */
function accelerationVariation(samples: MotionSample[]): number {
  if (samples.length < 2) return 0;

  const mean = {
    x: samples.reduce((sum, sample) => sum + sample.x, 0) / samples.length,
    y: samples.reduce((sum, sample) => sum + sample.y, 0) / samples.length,
    z: samples.reduce((sum, sample) => sum + sample.z, 0) / samples.length
  };

  const variance =
    samples.reduce((sum, sample) => {
      return (
        sum +
        (sample.x - mean.x) ** 2 +
        (sample.y - mean.y) ** 2 +
        (sample.z - mean.z) ** 2
      );
    }, 0) / samples.length;

  return Math.sqrt(variance);
}

/** The average spin of the gyroscope, in radians per second. */
function gyroscopeRms(samples: MotionSample[]): number {
  if (samples.length === 0) return 0;

  const meanSquare =
    samples.reduce(
      (sum, sample) => sum + sample.x ** 2 + sample.y ** 2 + sample.z ** 2,
      0
    ) / samples.length;

  return Math.sqrt(meanSquare);
}

/**
 * Roughly how many readings per second the phone produced.
 * Used to work out how many readings belong to the first 150 milliseconds.
 */
function estimateSampleRate(samples: MotionSample[]): number {
  if (samples.length < 2) return 50;

  const durationMs =
    samples[samples.length - 1].timestamp - samples[0].timestamp;

  if (durationMs <= 0) return 50;

  return (samples.length - 1) / (durationMs / 1000);
}

/**
 * THE MAIN FUNCTION OF THIS FILE.
 *
 * Takes the raw sensor readings and returns the measurements that describe them.
 *
 * `accelerometer` - every reading from the accelerometer (how fast the phone moves).
 * `gyroscope`     - every reading from the gyroscope (how fast the phone turns).
 */
export function computeHandlingFeatures(
  accelerometer: MotionSample[],
  gyroscope: MotionSample[],
  thresholds: Thresholds = DEFAULT_THRESHOLDS
): HandlingFeatures {
  const sampleCount = accelerometer.length;

  if (sampleCount === 0) {
    return {
      accelerometerRms: 0,
      gyroscopeRms: 0,
      startTiltDeg: 0,
      currentTiltDeg: 0,
      orientationChangeDeg: 0,
      rotationPathDeg: 0,
      dutyCycle: 0,
      activeDurationMs: 0,
      stillness: 1,
      samples: 0
    };
  }

  const ordered = [...accelerometer].sort((a, b) => a.timestamp - b.timestamp);

  const segments = buildSegments(
    ordered,
    thresholds.segmentDurationMs,
    thresholds
  );
  const validSegments = segments.filter((segment) => segment.isValid);
  const quietSegments = validSegments.filter((segment) => segment.isQuiet);

  // --- 1. How tilted is the phone at the end of the recording? ---
  // We prefer the last calm piece, because a phone that is being waved around at the
  // very end gives a poor reading of how it is being held.
  const currentSegment =
    quietSegments[quietSegments.length - 1] ??
    validSegments[validSegments.length - 1] ??
    null;

  const currentTiltDeg = currentSegment?.tiltFromFlatDeg ?? 0;

  // --- 2. How tilted was the phone at the start? ---
  const startSegment = quietSegments[0] ?? validSegments[0] ?? null;
  const startTiltDeg = startSegment?.tiltFromFlatDeg ?? 0;

  // --- 3. How much did the direction of gravity change? ---
  // The "early" direction uses the very first moments of the recording, because that
  // is usually still the resting position (the pick-up itself takes a moment).
  const earlyWindowMs = Math.min(150, thresholds.segmentDurationMs);
  const earlyCount = Math.max(
    1,
    Math.min(
      ordered.length,
      Math.round((earlyWindowMs / 1000) * estimateSampleRate(ordered))
    )
  );
  const earlyDirection = normalize(
    trimmedMeanVector(ordered.slice(0, earlyCount))
  );

  let orientationChangeDeg = 0;

  if (earlyDirection && currentSegment?.gravity) {
    orientationChangeDeg = angleBetweenDeg(
      earlyDirection,
      currentSegment.gravity
    );
  }

  // The same question asked using the first and last calm pieces. Taking the larger
  // of the two answers makes the check fairer to phones with noisy readings.
  if (quietSegments.length >= 2) {
    const fromFirstQuiet = angleBetweenDeg(
      quietSegments[0].gravity as Vector3,
      quietSegments[quietSegments.length - 1].gravity as Vector3
    );

    orientationChangeDeg = Math.max(orientationChangeDeg, fromFirstQuiet);
  }

  // --- 4. Was the phone moving the whole time, or was it just one buzz? ---
  const { dutyCycle, activeDurationMs } = measureContinuity(
    ordered,
    segments,
    thresholds
  );

  // --- 5. How much did the phone turn in total? ---
  const rotationPathDeg = measureRotationPath(gyroscope);

  return {
    accelerometerRms: accelerationVariation(ordered),
    gyroscopeRms: gyroscopeRms(gyroscope),
    startTiltDeg,
    currentTiltDeg,
    orientationChangeDeg,
    rotationPathDeg,
    dutyCycle,
    activeDurationMs,
    stillness: Math.max(0, Math.min(1, 1 - dutyCycle)),
    samples: sampleCount
  };
}
