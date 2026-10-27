/**
 * WHAT IS THIS FILE?
 * ------------------
 * This is the front door of the SDK. `verifyPhoneInHand()` is the one function most
 * apps need.
 *
 * WHAT DOES IT ACTUALLY DO?
 * -------------------------
 * 1. It records the phone's motion for a couple of seconds (see `collector.ts`).
 * 2. It hands the readings to `features.ts`, which measures what happened.
 * 3. It hands those measurements to `classifier.ts`, which decides what they mean.
 * 4. It gives you back a clear answer, the measurements behind it, and a sentence in
 *    plain English that you can show straight to the user.
 *
 * HOW DO I USE IT?
 * -----------------
 *   const result = await verifyPhoneInHand();
 *
 *   if (result.verified) {
 *     // the phone is in a hand, let the user in
 *   } else {
 *     // show result.reason to the user
 *   }
 *
 * IMPORTANT FOR THE USER EXPERIENCE
 * ---------------------------------
 * The check works best when the phone starts the check lying on a table and the user
 * picks it up while the check is running. That is the moment when the direction of
 * gravity inside the phone changes, and that is the strongest evidence that a real
 * hand is holding the phone.
 *
 * If the phone is already in the user's hand when the check starts, that is fine too:
 * the SDK notices that the phone was already tilted and only asks that it keeps
 * moving.
 */

import { classifyHandling, summarizeMotion } from "./classifier";
import { collectMotion } from "./collector";
import { resolveThresholds } from "./thresholds";
import type {
  HandlingChecks,
  HandlingFeatures,
  VerificationResult,
  VerifyOptions
} from "./types";

/**
 * An empty set of measurements, used when the check could not even start.
 */
function emptyFeatures(samples = 0): HandlingFeatures {
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
    samples
  };
}

/**
 * The three checks, all answered "no", used when the check could not be completed.
 */
function failedChecks(): HandlingChecks {
  return { notResting: false, reoriented: false, continuous: false };
}

/**
 * WATCHES THE PHONE AND DECIDES IF IT IS BEING HELD.
 *
 * @param options How long to watch, how often to read the sensors, and how strict to be.
 * @returns The verdict, the measurements behind it, and an explanation.
 */
export async function verifyPhoneInHand(
  options: VerifyOptions = {}
): Promise<VerificationResult> {
  const thresholds = resolveThresholds(options.thresholds);

  // How long we watch the phone. 2.5 seconds gives a real person time to notice the
  // prompt, pick the phone up and start moving it.
  const durationMs = options.durationMs ?? 2500;

  // How often we read the sensors. 20 ms means 50 readings a second, which is
  // detailed enough to tell a smooth pick-up apart from a buzz.
  const intervalMs = options.sampleIntervalMs ?? 20;

  // The smallest number of readings we accept before we are willing to answer.
  const minSamples = options.minSamples ?? thresholds.minSamplesForVerdict;

  const startedAt = Date.now();

  const recorded = await collectMotion({
    durationMs,
    sampleIntervalMs: intervalMs,
    onProgress: options.onProgress
  });

  const duration = Date.now() - startedAt;
  const count = recorded.accelerometer.length;

  // The device has no accelerometer, so there is nothing we can do.
  if (recorded.error === "accelerometer_unavailable") {
    return {
      status: "sensor_unavailable",
      verified: false,
      confidence: 0,
      durationMs: duration,
      samples: 0,
      reason:
        "This device does not have a working accelerometer, so we cannot check whether the phone is being held.",
      features: emptyFeatures(0),
      checks: failedChecks()
    };
  }

  // Something else went wrong while talking to the sensors.
  if (recorded.error) {
    return {
      status: "sensor_unavailable",
      verified: false,
      confidence: 0,
      durationMs: duration,
      samples: count,
      reason: `We could not read the phone's motion sensors: ${recorded.error}`,
      features: emptyFeatures(count),
      checks: failedChecks()
    };
  }

  // The sensors did not deliver enough readings to make a fair judgement.
  if (count < minSamples) {
    return {
      status: "timed_out",
      verified: false,
      confidence: 0,
      durationMs: duration,
      samples: count,
      reason:
        "The phone did not send enough sensor readings, so we could not check whether it is being held.",
      features: emptyFeatures(count),
      checks: failedChecks()
    };
  }

  // Measure what happened...
  const summary = summarizeMotion(
    recorded.accelerometer,
    recorded.gyroscope,
    thresholds
  );
  const features = (summary.features ??
    emptyFeatures(count)) as HandlingFeatures;

  // ...and turn those measurements into a verdict.
  const decision = classifyHandling(features, thresholds);

  return {
    status: decision.status,
    verified: decision.verified,
    confidence: decision.confidence,
    durationMs: duration,
    samples: count,
    reason: decision.reason,
    features,
    checks: decision.checks
  };
}
