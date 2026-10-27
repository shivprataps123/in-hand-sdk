/**
 * WHAT IS THIS FILE?
 * ------------------
 * This file holds the "dials" that decide how strict the In-Hand SDK is.
 *
 * WHY DOES IT EXIST?
 * -------------------
 * Every phone is a little different, and every product makes a different trade-off
 * between "never let anyone through" and "never annoy a real user". Instead of hiding
 * these numbers inside the code, they live here where they can be read, explained and
 * changed - either here, or per call through `options.thresholds`.
 *
 * HOW DO I TUNE THEM?
 * -------------------
 * 1. Run the Motion Lab screen (route `/lab` in the app) and record a few real samples
 *    of "phone in my hand" and "phone on the table".
 * 2. Compare the numbers that come back with the defaults below.
 * 3. Move a default a little if your numbers sit close to the line.
 *    A good rule of thumb: leave a gap of at least 2x between the two groups.
 *
 * Every threshold is written in plain units (degrees, milliseconds, "g") so that
 * non-programmers can reason about them too.
 */

import type { Thresholds } from "./types";

/**
 * The default settings. They are tuned for a phone held in one hand and picked up from
 * a table, and they are deliberately conservative: it is better to ask the user to try
 * again than to let a phone lying on a table through the check.
 */
export const DEFAULT_THRESHOLDS: Thresholds = {
  /**
   * 25 degrees of tilt.
   * A phone lying flat on a table reads 0 degrees. A phone lying on its side reads 90.
   * A phone in a hand normally reads somewhere between 30 and 80 degrees, so 25 gives a
   * comfortable safety margin below a real hand and well above a table.
   */
  minTiltDeg: 25,

  /**
   * 20 degrees of change of direction.
   * This is the most important number in the whole SDK. A phone that is picked up and
   * turned in the hand changes the direction of gravity inside it by far more than
   * 20 degrees. A phone that is shaken, slid or vibrates on a table barely changes it
   * at all, because the phone stays flat on the table the whole time.
   */
  minOrientationChangeDeg: 20,

  /**
   * 45 degrees of total turning (measured with the gyroscope).
   * This is used as a second chance for the check above, for phones whose
   * accelerometer readings are noisy. Shaking a phone on a table rolls it back and
   * forth, which produces far less total turning than a pick-up does.
   */
  minRotationPathDeg: 45,

  /**
   * 20% of the check must be spent moving.
   * A notification buzz lasts a fraction of a second, so it fills only a small part of
   * a 2.5 second check and stays well below this line.
   */
  minDutyCycle: 0.2,

  /**
   * 300 milliseconds of movement.
   * Together with the "duty cycle" above this rules out short, sharp movements such as
   * a single knock on the table.
   */
  minActiveDurationMs: 300,

  /**
   * 0.02 g is the "this counts as movement" line.
   * A phone lying still produces readings that wobble by roughly 0.001 g, so 0.02 g is
   * comfortably above the sensor's own noise and comfortably below a real movement.
   */
  motionThresholdG: 0.02,

  /**
   * 0.01 g is the "this piece of the recording is calm" line.
   * The SDK uses calm pieces to work out which way gravity is pulling inside the phone.
   */
  quietThresholdG: 0.01,

  /**
   * 200 milliseconds per piece.
   * Long enough to average out the sensor's noise, short enough that a quick pick-up
   * is still seen as a change of direction.
   */
  segmentDurationMs: 200,

  /**
   * 20 readings are needed before the SDK is willing to answer.
   * At 50 readings per second that is 0.4 seconds of data.
   */
  minSamplesForVerdict: 20
};

/**
 * Merges the default thresholds with any custom ones supplied by the caller.
 *
 * Example: `{ thresholds: { minTiltDeg: 40 } }` keeps every default but makes the
 * tilt requirement stricter.
 */
export function resolveThresholds(overrides?: Partial<Thresholds>): Thresholds {
  if (!overrides) return DEFAULT_THRESHOLDS;

  return { ...DEFAULT_THRESHOLDS, ...overrides };
}
