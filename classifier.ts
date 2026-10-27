/**
 * WHAT IS THIS FILE?
 * ------------------
 * This file is the "judge". It takes the measurements from `features.ts` and decides
 * whether the phone is really being held in a hand.
 *
 * WHY DOES IT EXIST?
 * -------------------
 * The measurements on their own do not mean anything ("tilted 40 degrees", "moved 60%
 * of the time"). Somebody has to compare them against the rules and produce a single,
 * clear answer. That is what happens here.
 *
 * THE THREE RULES
 * ---------------
 * All three must be true for the SDK to say "yes, the phone is in a hand":
 *
 *   1. NOT RESTING   - the phone is not lying flat on a surface right now.
 *                       A phone on a table reads about 0 degrees of tilt.
 *                       A phone in a hand reads 25-90 degrees.
 *
 *   2. PICKED UP     - the phone genuinely changed direction during the check,
 *                       OR it was already tilted when the check started.
 *                       This is the rule that stops a phone being shaken on a table
 *                       from passing: shaking moves the phone but never changes which
 *                       way gravity pulls inside it.
 *
 *   3. CONTINUOUS    - the phone kept moving for a meaningful part of the check.
 *                       A single notification buzz is far too short.
 *
 * HOW DO I USE IT?
 * -----------------
 * Normally `verifyPhoneInHand()` calls this for you. You can also call it yourself
 * with your own measurements, which is handy when testing.
 */

import { computeHandlingFeatures } from "./features";
import { DEFAULT_THRESHOLDS } from "./thresholds";
import type {
  HandlingChecks,
  HandlingDecision,
  HandlingFeatures,
  MotionSample,
  MotionSummary,
  Thresholds,
  VerificationStatus
} from "./types";

/**
 * Puts a number on a scale from 0 to 1, where 0 means "just on the line" and 1 means
 * "well past the line". Used to describe how strong the evidence is.
 */
function margin(value: number, threshold: number, span: number): number {
  if (span <= 0) return value >= threshold ? 1 : 0;

  const ratio = (value - threshold) / span;

  return Math.max(0, Math.min(1, ratio));
}

/** Rounds a number to two decimal places, so the output is easy to read. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Turns a set of measurements into a verdict.
 *
 * This is the production decision. Pass it the `features` from `summarizeMotion()`
 * (or from `computeHandlingFeatures()`).
 */
export function classifyHandling(
  features: HandlingFeatures,
  thresholds: Thresholds = DEFAULT_THRESHOLDS
): HandlingDecision {
  // --- The three yes/no rules ---
  const checks: HandlingChecks = {
    // Rule 1: the phone is not lying flat on a surface right now.
    notResting: features.currentTiltDeg >= thresholds.minTiltDeg,

    // Rule 2: the phone was picked up and turned, or it was already being held.
    // The "already being held" part matters: if the user starts the check with the
    // phone in their hand, simply moving it is enough - no pick-up is needed.
    reoriented:
      features.orientationChangeDeg >= thresholds.minOrientationChangeDeg ||
      features.rotationPathDeg >= thresholds.minRotationPathDeg ||
      features.startTiltDeg >= thresholds.minTiltDeg,

    // Rule 3: the phone kept moving, instead of giving one short jolt.
    continuous:
      features.dutyCycle >= thresholds.minDutyCycle &&
      features.activeDurationMs >= thresholds.minActiveDurationMs
  };

  const verified = checks.notResting && checks.reoriented && checks.continuous;

  // --- How strong is the evidence? ---
  // Each margin says "how far past its line did this measurement go?".
  const tiltMargin = margin(features.currentTiltDeg, thresholds.minTiltDeg, 35);
  const orientationMargin = margin(
    features.orientationChangeDeg,
    thresholds.minOrientationChangeDeg,
    40
  );
  const rotationMargin = margin(
    features.rotationPathDeg,
    thresholds.minRotationPathDeg,
    60
  );
  const movementMargin = margin(
    features.dutyCycle,
    thresholds.minDutyCycle,
    0.4
  );

  const turnMargin = Math.max(orientationMargin, rotationMargin);
  const strength = 0.35 * tiltMargin + 0.4 * turnMargin + 0.25 * movementMargin;

  let status: VerificationStatus;
  let reason: string;
  let confidence: number;

  if (verified) {
    status = "likely_handled";
    confidence = round(0.55 + 0.45 * strength);
    reason =
      "The phone was picked up and tilted in your hand and kept moving, so it looks like you are holding it.";
  } else if (!checks.notResting) {
    // The phone is still flat. This is the "it is on the table" case.
    status = "likely_resting";
    confidence = round(0.5 + 0.5 * (1 - tiltMargin));
    reason =
      "The phone still looks like it is lying flat on a surface. Pick it up, hold it in your hand, and try again.";
  } else if (!checks.reoriented) {
    // The phone is tilted and moving, but it never changed direction. That is what a
    // phone being shaken on a table looks like.
    status = "likely_not_held";
    confidence = round(0.5 + 0.5 * (1 - turnMargin));
    reason =
      "The phone moved, but it never changed direction, which is what happens when a phone lying on a table is shaken. Pick the phone up to continue.";
  } else {
    // It was picked up, but the movement was too small or too short to be sure.
    status = "inconclusive";
    confidence = round(0.5 + 0.5 * (1 - movementMargin));
    reason =
      "The movement was too short or too small. Hold the phone in your hand for a moment and try again.";
  }

  return { status, verified, confidence, reason, checks };
}

/**
 * Summarises a recording.
 *
 * Give it every accelerometer reading and every gyroscope reading and it returns the
 * simple averages plus the full set of measurements.
 */
export function summarizeMotion(
  accelerometer: MotionSample[],
  gyroscope: MotionSample[],
  thresholds: Thresholds = DEFAULT_THRESHOLDS
): MotionSummary {
  const features = computeHandlingFeatures(
    accelerometer,
    gyroscope,
    thresholds
  );

  return {
    accelerometerRms: features.accelerometerRms,
    gyroscopeRms: features.gyroscopeRms,
    samples: Math.min(accelerometer.length, gyroscope.length),
    features
  };
}

/**
 * The original, simpler check.
 *
 * It is kept so that older code keeps working. It only knows about "how much did the
 * phone move", which cannot tell a phone in a hand apart from a phone being shaken on
 * a table.
 *
 * If the summary contains the newer measurements, the modern rules are used instead.
 */
export function classifyMotion(summary: MotionSummary): HandlingDecision {
  if (summary.features) {
    return classifyHandling(summary.features);
  }

  if (summary.samples < 5) {
    return {
      status: "inconclusive",
      verified: false,
      confidence: 0,
      reason: "Insufficient sensor samples.",
      checks: {
        notResting: true,
        reoriented: true,
        continuous: false
      }
    };
  }

  const moving =
    summary.accelerometerRms > 0.035 || summary.gyroscopeRms > 0.12;

  if (moving) {
    return {
      status: "likely_handled",
      verified: true,
      confidence: 0.6,
      reason: "Motion consistent with device handling.",
      checks: {
        notResting: true,
        reoriented: true,
        continuous: true
      }
    };
  }

  return {
    status: "inconclusive",
    verified: false,
    confidence: 0.25,
    reason: "No clear handling motion detected.",
    checks: {
      notResting: true,
      reoriented: true,
      continuous: false
    }
  };
}
