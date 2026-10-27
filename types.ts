/**
 * WHAT IS THIS FILE?
 * ------------------
 * This file holds the "shape" of every piece of information the In-Hand SDK passes
 * around. A "type" is simply a description of what a piece of data looks like, so
 * that every part of the code agrees on the same format.
 *
 * WHY DOES IT EXIST?
 * -------------------
 * The SDK is used by other people (and other apps), so the result of a check has to be
 * predictable and self-describing. Everything a caller might want to know is described
 * here, including the human-readable measurements ("features") that explain *why* the
 * SDK reached its decision.
 *
 * HOW DO I USE IT?
 * -----------------
 * You normally do not need to import these by hand. Import them from the package root
 * instead: `import { verifyPhoneInHand } from "in-hand-sdk";`
 */

/**
 * The overall outcome of a check.
 *
 * - "likely_handled"      -> Good news: the phone looks like it is in a hand.
 * - "likely_resting"      -> The phone still looks like it is lying flat on a surface.
 * - "likely_not_held"     -> The phone moved, but in a way that does not look like a hand.
 * - "inconclusive"        -> Not enough information (too little movement, too short a check).
 * - "sensor_unavailable"  -> The device has no usable accelerometer.
 * - "timed_out"           -> The sensors did not deliver enough readings in time.
 */
export type VerificationStatus =
  | "likely_handled"
  | "likely_resting"
  | "likely_not_held"
  | "inconclusive"
  | "sensor_unavailable"
  | "timed_out";

/**
 * The individual "measurements" the SDK takes while it watches the phone.
 *
 * These are the raw ingredients of the decision. They are returned with every result so
 * that you can see exactly why the SDK answered the way it did - for example when you
 * are tuning the thresholds for your own device.
 */
export interface HandlingFeatures {
  /**
   * How much the phone shook, on average, in "g" (1 g is the pull of gravity).
   * A phone lying still on a table is close to 0. A phone being moved is well above 0.
   */
  accelerometerRms: number;

  /**
   * How fast the phone was turning, on average, in radians per second.
   * 0 means it was not rotating at all.
   */
  gyroscopeRms: number;

  /**
   * How tilted the phone was at the *start* of the check, in degrees.
   * 0 degrees means it was lying flat (like a card on a table).
   * 90 degrees means it was standing upright.
   */
  startTiltDeg: number;

  /**
   * How tilted the phone was at the *end* of the check, in degrees.
   * This is the most important number for the "is it in a hand?" question:
   * a phone resting on a table stays near 0 degrees, a phone in a hand is usually
   * somewhere between 25 and 90 degrees.
   */
  currentTiltDeg: number;

  /**
   * How much the phone changed direction during the check, in degrees.
   * The direction of gravity inside the phone is a fingerprint of how the phone is
   * lying. A phone that is picked up and turned changes this fingerprint a lot.
   * A phone that is simply shaken on a table barely changes it at all.
   */
  orientationChangeDeg: number;

  /**
   * The total amount the phone turned during the check, in degrees.
   * This is measured with the gyroscope (the "compass of spinning").
   */
  rotationPathDeg: number;

  /**
   * What share of the check was spent moving, from 0 (never moved) to 1 (moved the
   * whole time).
   * A notification buzz is a short burst, so this stays low.
   * A phone being held and moved stays high.
   */
  dutyCycle: number;

  /**
   * How many milliseconds the phone was actually moving.
   * Used together with `dutyCycle` to tell "moved for a long time" from
   "jumped once".
   */
  activeDurationMs: number;

  /**
   * How still the phone was, from 0 (moving the whole time) to 1 (never moved).
   * Handy for spotting "frozen" sensor readings.
   */
  stillness: number;

  /**
   * How many sensor readings were used to work all of this out.
   */
  samples: number;
}

/**
 * The three simple yes/no questions the SDK asks about a phone.
 *
 * All three must be "yes" for the SDK to say the phone is in a hand:
 *
 *  1. `notResting`  - the phone is not lying flat on a surface any more.
 *  2. `reoriented`  - the phone genuinely changed direction (it was picked up/turned).
 *  3. `continuous`  - the movement lasted, it was not just one short buzz.
 */
export interface HandlingChecks {
  /** The phone is currently tilted, i.e. it is not lying flat on a table. */
  notResting: boolean;

  /** The phone changed direction during the check, i.e. somebody picked it up. */
  reoriented: boolean;

  /** The phone kept moving for a meaningful part of the check. */
  continuous: boolean;
}

/**
 * The decision the SDK reaches, before it is wrapped up as a full result.
 *
 * This is what `classifyHandling()` returns: the verdict, how sure we are, the
 * three yes/no checks, and a sentence explaining it all in plain English.
 */
export interface HandlingDecision {
  /** The short verdict, e.g. "likely_handled". */
  status: VerificationStatus;

  /** `true` only when the phone really does look like it is being held. */
  verified: boolean;

  /** How sure the SDK is, from 0 to 1. */
  confidence: number;

  /** A short sentence, in plain English, explaining the result. */
  reason: string;

  /** The three yes/no questions, so you can show exactly what was missing. */
  checks: HandlingChecks;
}

/**
 * The final answer returned by `verifyPhoneInHand()`.
 */
export interface VerificationResult {
  /** The short verdict, e.g. "likely_handled". */
  status: VerificationStatus;

  /** `true` only when the phone really does look like it is being held. */
  verified: boolean;

  /**
   * How sure the SDK is, from 0 to 1.
   * A low number means "it is borderline", a high number means "the evidence is clear".
   */
  confidence: number;

  /** How long the whole check took, in milliseconds. */
  durationMs: number;

  /** How many accelerometer readings were collected. */
  samples: number;

  /** A short sentence, in plain English, explaining the result. */
  reason: string;

  /** The measurements behind the decision (always present, for debugging and tuning). */
  features: HandlingFeatures;

  /** The three yes/no questions, so you can show exactly what was missing. */
  checks: HandlingChecks;
}

/**
 * The knobs you can turn to change how strict the SDK is.
 *
 * You do not have to change any of these - the defaults work for most phones.
 * They are exposed so that you can tune the SDK for a specific device or a specific
 * product decision (for example: "how many seconds must the phone be held?").
 */
export interface Thresholds {
  /**
   * How tilted the phone must be (in degrees) to count as "being held".
   * Default 25 degrees. A phone lying flat scores 0, a phone in a hand scores 25-90.
   */
  minTiltDeg: number;

  /**
   * How much the phone must change direction (in degrees) to count as "it was picked up".
   * Default 20 degrees.
   */
  minOrientationChangeDeg: number;

  /**
   * Alternative to `minOrientationChangeDeg`: how much the phone must turn in total
   * (in degrees) to count as "it was picked up".
   * Default 45 degrees.
   */
  minRotationPathDeg: number;

  /**
   * The smallest share of the check that must be spent moving, from 0 to 1.
   * Default 0.2 (20%). A short notification buzz scores much lower than this.
   */
  minDutyCycle: number;

  /**
   * The shortest amount of continuous movement (in milliseconds) that counts as
   * "the phone was really being moved". Default 300 ms.
   */
  minActiveDurationMs: number;

  /**
   * How big a movement has to be (in "g") before it is counted as movement at all.
   * Default 0.02 g. This is the "ignore sensor noise" line.
   */
  motionThresholdG: number;

  /**
   * How still a short piece of the recording has to be (in "g") before the SDK calls it
   * "quiet" and uses it to work out which way gravity is pulling.
   * Default 0.01 g.
   */
  quietThresholdG: number;

  /**
   * The length of one short "piece" of the recording, in milliseconds.
   * The SDK chops the recording into pieces of this size and studies each one.
   * Default 200 ms.
   */
  segmentDurationMs: number;

  /**
   * The smallest number of sensor readings that still allows a decision.
   * Default 20 readings (about 0.4 seconds at 50 readings per second).
   */
  minSamplesForVerdict: number;
}

/**
 * The options you can pass to `verifyPhoneInHand()`.
 */
export interface VerifyOptions {
  /**
   * How long to watch the phone, in milliseconds.
   * Default 2500 ms (2.5 seconds). Give the user enough time to pick the phone up.
   */
  durationMs?: number;

  /**
   * How often to read the sensors, in milliseconds.
   * Default 20 ms (50 readings per second).
   * Faster readings give a more detailed picture, but use a little more battery.
   */
  sampleIntervalMs?: number;

  /**
   * The smallest number of readings that still allows a decision.
   * Default 20.
   */
  minSamples?: number;

  /**
   * Called every time a new reading arrives, with the running total of readings.
   * Handy for showing a progress bar.
   */
  onProgress?: (samples: number) => void;

  /**
   * Optional overrides for the built-in thresholds.
   * Example: `{ thresholds: { minTiltDeg: 40 } }` demands a more clearly tilted phone.
   */
  thresholds?: Partial<Thresholds>;
}

/**
 * One single reading from the accelerometer (how fast the phone is accelerating).
 */
export interface MotionSample {
  /** Acceleration along the phone's left/right axis, in "g". */
  x: number;
  /** Acceleration along the phone's top/bottom axis, in "g". */
  y: number;
  /** Acceleration along the phone's screen/away-from-screen axis, in "g". */
  z: number;
  /** When the reading was taken, in milliseconds since the epoch. */
  timestamp: number;
}

/**
 * A compact summary of a recording.
 *
 * `features` holds the detailed measurements. The three top-level numbers are kept
 * for backwards compatibility with older versions of the SDK.
 */
export interface MotionSummary {
  /** Average shake amount, in "g". */
  accelerometerRms: number;
  /** Average spin amount, in radians per second. */
  gyroscopeRms: number;
  /** How many readings were used. */
  samples: number;
  /** The detailed measurements behind the decision. */
  features?: HandlingFeatures;
}
