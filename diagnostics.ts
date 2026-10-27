/**
 * WHAT IS THIS FILE?
 * ------------------
 * This file is the "tuning workshop" for the SDK.
 *
 * WHY DOES IT EXIST?
 * -------------------
 * The default thresholds are a good starting point, but every phone behaves a little
 * differently and every product wants a slightly different balance between security
 * and convenience. The only reliable way to set those numbers is to measure them on
 * real phones.
 *
 * This file lets you record real examples - "phone in my hand", "phone on the table",
 * "phone shaken on the table" - and then compare the measurements side by side. When
 * the two groups are clearly separated, the thresholds can be placed in the gap
 * between them.
 *
 * HOW DO I USE IT?
 * -----------------
 * 1. Open the Motion Lab screen in the app (the `/lab` route).
 * 2. Record a few examples of each kind, using the buttons on that screen.
 * 3. Compare the numbers. If "in hand" and "on table" overlap, adjust the
 *    thresholds in `thresholds.ts` and record again.
 *
 * This file is not needed in production apps. It is here so that the SDK can be
 * measured rather than guessed at.
 */

import { classifyHandling, summarizeMotion } from "./classifier";
import { collectMotion } from "./collector";
import { resolveThresholds } from "./thresholds";
import type {
    HandlingChecks,
    HandlingFeatures,
    Thresholds,
    VerificationStatus
} from "./types";

/**
 * The kinds of situation we record.
 *
 * - "in_hand"          - the phone is being held in a hand.
 * - "on_table"         - the phone is lying still on a table.
 * - "shaking_on_table" - the phone is lying on a table and is being shaken.
 * - "picked_up"        - the phone starts on a table and is picked up.
 */
export type MotionLabel =
  | "in_hand"
  | "on_table"
  | "shaking_on_table"
  | "picked_up";

/** One recorded example. */
export interface MotionRecord {
  /** What the person was doing during the recording. */
  label: MotionLabel;

  /** When the recording was made. */
  recordedAt: string;

  /** How long the recording was, in milliseconds. */
  durationMs: number;

  /** How many sensor readings were collected. */
  sampleCount: number;

  /** All the measurements. */
  features: HandlingFeatures;

  /** The three yes/no checks, as the SDK judged this recording. */
  checks: HandlingChecks;

  /** The verdict the SDK gave. */
  status: VerificationStatus;

  /** Whether the SDK accepted the phone as being held. */
  verified: boolean;

  /** How sure the SDK was, from 0 to 1. */
  confidence: number;
}

/** How to run a recording. */
export interface RecordOptions {
  /** How long to record for, in milliseconds. Default 2500. */
  durationMs?: number;

  /** How often to read the sensors, in milliseconds. Default 20. */
  sampleIntervalMs?: number;

  /** Optional threshold overrides, so you can try out different settings. */
  thresholds?: Partial<Thresholds>;
}

/**
 * RECORDS ONE EXAMPLE AND JUDGES IT.
 *
 * @param label What the person was doing, so the recording can be compared later.
 */
export async function recordMotion(
  label: MotionLabel,
  options: RecordOptions = {}
): Promise<MotionRecord> {
  const thresholds = resolveThresholds(options.thresholds);
  const startedAt = Date.now();

  const recorded = await collectMotion({
    durationMs: options.durationMs ?? 2500,
    sampleIntervalMs: options.sampleIntervalMs ?? 20
  });

  const summary = summarizeMotion(
    recorded.accelerometer,
    recorded.gyroscope,
    thresholds
  );

  const features = summary.features as HandlingFeatures;
  const decision = classifyHandling(features, thresholds);

  return {
    label,
    recordedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    sampleCount: recorded.accelerometer.length,
    features,
    checks: decision.checks,
    status: decision.status,
    verified: decision.verified,
    confidence: decision.confidence
  };
}

/** The average of a list of numbers. */
function average(values: number[]): number {
  if (values.length === 0) return 0;

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** The averages of one label, so groups can be compared. */
export interface LabelSummary {
  /** How many recordings were made with this label. */
  count: number;

  /** How often the SDK accepted the phone as being held. */
  acceptedRate: number;

  /** Average tilt at the end of the recording, in degrees. */
  averageCurrentTiltDeg: number;

  /** Average tilt at the start of the recording, in degrees. */
  averageStartTiltDeg: number;

  /** Average change of direction, in degrees. */
  averageOrientationChangeDeg: number;

  /** Average share of the recording spent moving. */
  averageDutyCycle: number;

  /** Average amount of time spent moving, in milliseconds. */
  averageActiveDurationMs: number;
}

/**
 * GROUPS THE RECORDINGS BY LABEL AND AVERAGES THEM.
 *
 * This is the table you look at when deciding where to put the thresholds:
 * the "in hand" row and the "on table" row should be clearly apart.
 */
export function summariseRecords(
  records: MotionRecord[]
): Record<string, LabelSummary> {
  const groups: Record<string, MotionRecord[]> = {};

  for (const record of records) {
    if (!groups[record.label]) groups[record.label] = [];
    groups[record.label].push(record);
  }

  const summary: Record<string, LabelSummary> = {};

  for (const [label, group] of Object.entries(groups)) {
    summary[label] = {
      count: group.length,
      acceptedRate:
        group.filter((record) => record.verified).length / group.length,
      averageCurrentTiltDeg: average(
        group.map((record) => record.features.currentTiltDeg)
      ),
      averageStartTiltDeg: average(
        group.map((record) => record.features.startTiltDeg)
      ),
      averageOrientationChangeDeg: average(
        group.map((record) => record.features.orientationChangeDeg)
      ),
      averageDutyCycle: average(
        group.map((record) => record.features.dutyCycle)
      ),
      averageActiveDurationMs: average(
        group.map((record) => record.features.activeDurationMs)
      )
    };
  }

  return summary;
}

/**
 * TURNS THE RECORDINGS INTO TEXT YOU CAN COPY AND PASTE.
 *
 * Paste it into a message, a ticket, or a spreadsheet when you need a second pair of
 * eyes on the numbers.
 */
export function exportRecords(records: MotionRecord[]): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      summary: summariseRecords(records),
      records
    },
    null,
    2
  );
}
