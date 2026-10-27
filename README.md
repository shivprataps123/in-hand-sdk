# In-Hand SDK

Detects whether a phone is really being **held in a hand**, using the phone's own
accelerometer and gyroscope through
[`expo-sensors`](https://docs.expo.dev/versions/latest/sdk/sensors/).

The goal is to stop a phone that is lying on a table - and being shaken, or buzzing
from a notification - from passing the check, while letting a real user through
smoothly.

## How it works (in plain English)

An accelerometer cannot tell you "a hand is touching me". It can only tell you how the
phone is moving. So the SDK looks at a different property that a table cannot fake:

> **A phone lying on a table always points the same way. A phone in a hand does not.**

While a phone lies flat on a table, gravity pulls in exactly the same direction inside
it, no matter how hard the table (or the phone) is shaken. The moment somebody picks
the phone up, gravity starts pulling in a different direction, and the phone is tilted
while it is held.

So the SDK measures three things and asks three questions:

| #   | Measurement            | Question it answers              | "Phone on table" | "Phone in hand" |
| --- | ---------------------- | -------------------------------- | ---------------- | --------------- |
| 1   | `currentTiltDeg`       | Is the phone lying flat?         | ~0°              | 25°-90°         |
| 2   | `orientationChangeDeg` | Was it picked up and turned?     | ~0°              | 30°+            |
| 3   | `dutyCycle`            | Was it moving, or just one buzz? | low              | high            |

All three must pass before the SDK says the phone is being held:

- **notResting** - the phone is not lying flat on a surface right now.
- **reoriented** - the phone genuinely changed direction during the check, _or_ it was
  already tilted when the check started (so a user who already holds the phone only
  has to move it).
- **continuous** - the phone kept moving for a meaningful part of the check, so a
  single notification buzz cannot get through.

## Install

```bash
npm install
```

## Run the app

```bash
npx expo start
```

Then pick a development build, emulator, simulator or Expo Go from the CLI output.

> Motion sensors do not work in a web browser, and are not available in Expo Go on
> web. The SDK answers `sensor_unavailable` in those cases.

## Run the tests

```bash
npx vitest run
```

The tests build pretend recordings of a phone on a table, shaken on a table, buzzing
from a notification, picked up, and held in a hand, and check that each one gets the
right answer.

## Usage

```ts
import { verifyPhoneInHand } from "in-hand-sdk";

const result = await verifyPhoneInHand();

if (result.verified) {
  // the phone is in a hand
} else {
  // show result.reason to the user - it is already written in plain English
}
```

### `verifyPhoneInHand(options?)`

| Option             | Default | What it does                                                   |
| ------------------ | ------- | -------------------------------------------------------------- |
| `durationMs`       | `2500`  | How long to watch the phone. Give the user time to pick it up. |
| `sampleIntervalMs` | `20`    | How often to read the sensors (50 readings a second).          |
| `minSamples`       | `20`    | The smallest number of readings needed for a fair answer.      |
| `onProgress`       | –       | Called with the running total of readings, for a progress bar. |
| `thresholds`       | –       | Override any of the built-in thresholds for this one call.     |

### The result

| Field        | What it means                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------ |
| `status`     | `likely_handled` \| `likely_resting` \| `likely_not_held` \| `inconclusive` \| `sensor_unavailable` \| `timed_out` |
| `verified`   | `true` only when the phone really does look like it is being held.                                                 |
| `confidence` | How sure the SDK is, from 0 to 1.                                                                                  |
| `durationMs` | How long the check took.                                                                                           |
| `samples`    | How many readings were collected.                                                                                  |
| `reason`     | A sentence in plain English that you can show to the user.                                                         |
| `features`   | All the measurements behind the decision.                                                                          |
| `checks`     | The three yes/no questions, so you can show exactly what was missing.                                              |

### The measurements (`features`)

| Field                  | Meaning                                                  |
| ---------------------- | -------------------------------------------------------- |
| `startTiltDeg`         | How tilted the phone was at the start of the check.      |
| `currentTiltDeg`       | How tilted the phone was at the end of the check.        |
| `orientationChangeDeg` | How much the direction of gravity changed.               |
| `rotationPathDeg`      | How much the phone turned in total (from the gyroscope). |
| `dutyCycle`            | The share of the check spent moving (0-1).               |
| `activeDurationMs`     | How many milliseconds the phone was actually moving.     |
| `accelerometerRms`     | Average shake, in "g".                                   |
| `gyroscopeRms`         | Average spin, in radians per second.                     |
| `stillness`            | How still the phone was (0-1).                           |

### Lower level helpers

```ts
import {
  classifyHandling,
  collectMotion,
  computeHandlingFeatures,
  summarizeMotion
} from "in-hand-sdk";

// Record the raw readings yourself...
const recorded = await collectMotion({ durationMs: 2500 });

// ...measure them...
const summary = summarizeMotion(recorded.accelerometer, recorded.gyroscope);

// ...and judge them.
const decision = classifyHandling(summary.features!);
```

## Tuning the thresholds for your own devices

The defaults are a good starting point, but numbers should be measured rather than
guessed. The app has a **Motion Lab** screen for exactly this - open the `/lab` route
in the app and record a few examples of each situation:

1. Phone lying still on a table.
2. Phone shaken on a table.
3. Phone buzzing from a notification.
4. Phone picked up from a table and held.
5. Phone already in a hand and being moved.

The screen shows the measurements for each recording, and the **Share the numbers**
button exports everything as JSON. Compare the groups: if "in hand" and "on table" are
clearly apart, the defaults work. If they overlap, move the relevant threshold in
[`src/thresholds.ts`](src/thresholds.ts) - each one is documented in plain English
there - and record again.

## Native setup

Both are already configured in [`app.json`](app.json):

- **iOS** - the `expo-sensors` config plugin adds `NSMotionUsageDescription`, which
  iOS requires before an app may read motion sensors.
- **Android** - `android.permission.HIGH_SAMPLING_RATE_SENSORS` lets the app ask for
  readings faster than every 200 ms. Without it, Android 12 and newer slow the
  sensors down and the measurements become much less detailed.

## What this SDK cannot do

No accelerometer can _prove_ that a hand is touching the phone. This SDK makes the
easy spoofing - shaking the phone on a table, or letting it buzz - fail, but a
determined person could still wave a phone around in the air to imitate a pick-up.

Treat the result as a friction signal, not as authentication. Use it together with
something that really proves who the user is (a one-time password, a passkey, or your
own server-side check).

If you need stronger proof, the next step is a **randomised challenge**: the server
asks for something like "pick the phone up and turn it 90 degrees to the left", with
the direction and angle different every time, and the phone reports the rotation it
actually measured. A phone lying on a table cannot rotate its own gravity axis by 90
degrees without somebody picking it up.

## Project layout

```
src/
  collector.ts      Recording the raw sensor readings
  features.ts       Turning readings into measurements
  classifier.ts     Turning measurements into a verdict
  thresholds.ts     The dials, and how to tune them
  verifyPhoneInHand.ts  The main check
  diagnostics.ts    Recording labelled examples for tuning
  types.ts          The shapes of all the data
  index.ts          The public exports
  app/              Expo Router screens (file-based routing)
examples/
  LoginScreen.tsx   The "continue to login" flow
  MotionLab.tsx     The calibration screen
tests/
  classifier.test.ts  The original classifier tests
  handling.test.ts    Tests for the new hand/table decision
```

## Learn more

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Expo Router](https://docs.expo.dev/router/introduction): File-based routing used by `src/app`.
- [expo-sensors](https://docs.expo.dev/versions/latest/sdk/sensors/): Accelerometer and gyroscope APIs.
