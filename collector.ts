/**
 * WHAT IS THIS FILE?
 * ------------------
 * This file does the "raw" work of reading the phone's motion sensors.
 *
 * WHY IS IT SEPARATE?
 * -------------------
 * Two parts of the SDK need raw readings:
 *   - `verifyPhoneInHand()`, which turns them into a verdict.
 *   - `diagnostics.ts`, which records them so the thresholds can be tuned.
 *
 * Keeping the sensor plumbing in one place means both use exactly the same method, so
 * a recording made in the Motion Lab is a true picture of what the SDK sees.
 *
 * HOW DOES IT WORK?
 * -----------------
 * It starts listening to the accelerometer (and the gyroscope, if there is one),
 * collects readings for a set time, and then switches the sensors off again.
 */

import { Accelerometer, Gyroscope } from "expo-sensors";

import type { MotionSample } from "./types";

/** How to run a recording. */
export interface CollectOptions {
  /** How long to record for, in milliseconds. Default 2500. */
  durationMs?: number;

  /**
   * How often to read the sensors, in milliseconds. Default 20 (50 readings a second).
   *
   * Note for Android: since Android 12 the system slows sensors down to one reading
   * every 200 ms unless the app asks for the "high sampling rate sensors" permission.
   * That permission is already declared for this app in `app.json`.
   */
  sampleIntervalMs?: number;

  /** Called after every reading, with the running total. */
  onProgress?: (samples: number) => void;
}

/** What came back from a recording. */
export interface CollectedMotion {
  /** Every accelerometer reading (how fast the phone moves), in "g". */
  accelerometer: MotionSample[];

  /** Every gyroscope reading (how fast the phone turns), in radians per second. */
  gyroscope: MotionSample[];

  /** True when the device has a gyroscope. */
  gyroAvailable: boolean;

  /** Set when something went wrong, for example "accelerometer unavailable". */
  error?: string;
}

/**
 * RECORDS THE PHONE'S MOTION FOR A SET TIME.
 *
 * The sensors are always switched off again before this function returns, so nothing
 * keeps running in the background and draining the battery.
 */
export async function collectMotion(
  options: CollectOptions = {}
): Promise<CollectedMotion> {
  const durationMs = options.durationMs ?? 2500;
  const intervalMs = options.sampleIntervalMs ?? 20;

  const accelerometer: MotionSample[] = [];
  const gyroscope: MotionSample[] = [];

  try {
    const accelAvailable = await Accelerometer.isAvailableAsync();

    if (!accelAvailable) {
      return {
        accelerometer,
        gyroscope,
        gyroAvailable: false,
        error: "accelerometer_unavailable"
      };
    }

    const gyroAvailable = await Gyroscope.isAvailableAsync();

    Accelerometer.setUpdateInterval(intervalMs);

    if (gyroAvailable) {
      Gyroscope.setUpdateInterval(intervalMs);
    }

    return await new Promise<CollectedMotion>((resolve) => {
      let accelSub: { remove(): void } | undefined;
      let gyroSub: { remove(): void } | undefined;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      let finished = false;

      const stop = () => {
        accelSub?.remove();
        gyroSub?.remove();
        if (timeout) clearTimeout(timeout);
      };

      const finish = (error?: string) => {
        if (finished) return;
        finished = true;
        stop();

        resolve({ accelerometer, gyroscope, gyroAvailable, error });
      };

      try {
        accelSub = Accelerometer.addListener((value) => {
          accelerometer.push({ ...value, timestamp: Date.now() });
          options.onProgress?.(accelerometer.length);
        });

        if (gyroAvailable) {
          gyroSub = Gyroscope.addListener((value) => {
            gyroscope.push({ ...value, timestamp: Date.now() });
          });
        }

        timeout = setTimeout(() => finish(), durationMs);
      } catch (error) {
        finish(String(error));
      }
    });
  } catch (error) {
    return {
      accelerometer,
      gyroscope,
      gyroAvailable: false,
      error: String(error)
    };
  }
}
