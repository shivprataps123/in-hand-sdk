/**
 * WHAT IS THIS FILE?
 * ------------------
 * This is the public doorway of the package. Whatever you want to use from the SDK,
 * you can import it from here:
 *
 *   import { verifyPhoneInHand } from "in-hand-sdk";
 *
 * HOW IS IT ORGANISED?
 * --------------------
 * - `verifyPhoneInHand`  - the main check. Start here.
 * - `classifyHandling`   - the decision rules, if you want to judge your own readings.
 * - `summarizeMotion`    - turns readings into measurements.
 * - `computeHandlingFeatures` - the measuring part on its own.
 * - `collectMotion`      - the raw sensor recording, if you want the readings yourself.
 * - `recordMotion` and friends - the tuning tools, for when you want to measure the
 *   thresholds on your own devices.
 * - `DEFAULT_THRESHOLDS` and `resolveThresholds` - the dials, and how to turn them.
 */

export { collectMotion } from "./collector";
export type { CollectedMotion, CollectOptions } from "./collector";

export {
    classifyHandling,
    classifyMotion,
    summarizeMotion
} from "./classifier";

export {
    angleBetweenDeg,
    computeHandlingFeatures,
    measureRotationPath,
    tiltFromFlat,
    trimmedMean
} from "./features";

export { DEFAULT_THRESHOLDS, resolveThresholds } from "./thresholds";

export { exportRecords, recordMotion, summariseRecords } from "./diagnostics";
export type {
    LabelSummary,
    MotionLabel,
    MotionRecord,
    RecordOptions
} from "./diagnostics";

export { verifyPhoneInHand } from "./verifyPhoneInHand";

export type {
    HandlingChecks,
    HandlingDecision,
    HandlingFeatures,
    MotionSample,
    MotionSummary,
    Thresholds,
    VerificationResult,
    VerificationStatus,
    VerifyOptions
} from "./types";

