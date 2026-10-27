/**
 * WHAT IS THIS FILE?
 * ------------------
 * The "Motion Lab": a screen used to measure how the SDK behaves on a real phone.
 *
 * WHY DOES IT EXIST?
 * -------------------
 * The SDK has to tell two situations apart:
 *
 *   A) the phone is in a hand  -> let the user in
 *   B) the phone is on a table -> do not let the user in
 *
 * The rules that separate A from B are numbers, and numbers should be measured, not
 * guessed. This screen records examples of each situation and shows the measurements
 * side by side, so you can place the thresholds in the gap between the two groups.
 *
 * HOW DO I USE IT?
 * -----------------
 * 1. Put the phone on the table and tap "On table". Wait for the recording to finish.
 * 2. Pick the phone up, hold it, and tap "In hand" - but start the recording first,
 *    then pick it up while it is recording.
 * 3. Repeat a few times for each situation.
 * 4. Compare the "tilt at the end" and "direction change" numbers.
 *    If the "in hand" numbers are clearly higher than the "on table" numbers, the
 *    defaults in `thresholds.ts` are working well.
 *
 * This screen is a development tool. You do not need it in a finished app.
 */

import {
    exportRecords,
    recordMotion,
    summariseRecords,
    type MotionLabel,
    type MotionRecord
} from "@/diagnostics";
import React, { useState } from "react";
import {
    ActivityIndicator,
    Button,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    View
} from "react-native";

/** The situations we can record, and how to explain them on the button. */
const LABELS: { label: MotionLabel; title: string; hint: string }[] = [
  {
    label: "in_hand",
    title: "In hand",
    hint: "Start the recording, then pick the phone up and hold it."
  },
  {
    label: "on_table",
    title: "On table",
    hint: "Leave the phone lying still on the table while it records."
  },
  {
    label: "shaking_on_table",
    title: "Shaken on table",
    hint: "Leave the phone on the table and shake it while it records."
  },
  {
    label: "picked_up",
    title: "Picked up",
    hint: "Start on the table, then pick the phone up while it records."
  }
];

export default function MotionLab() {
  const [recording, setRecording] = useState(false);
  const [records, setRecords] = useState<MotionRecord[]>([]);
  const [lastRecord, setLastRecord] = useState<MotionRecord | null>(null);

  async function handleRecord(label: MotionLabel) {
    setRecording(true);

    try {
      const record = await recordMotion(label);

      setLastRecord(record);
      setRecords((current) => [...current, record]);
    } finally {
      setRecording(false);
    }
  }

  async function handleShare() {
    await Share.share({ message: exportRecords(records) });
  }

  const summary = summariseRecords(records);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Motion Lab</Text>
      <Text style={styles.intro}>
        Record a few examples of each situation. The numbers below are what the
        SDK uses to decide, so you can check that they really do separate the
        cases.
      </Text>

      {LABELS.map((entry) => (
        <View key={entry.label} style={styles.card}>
          <Text style={styles.cardTitle}>{entry.title}</Text>
          <Text style={styles.cardHint}>{entry.hint}</Text>
          <Button
            title={`Record: ${entry.title}`}
            disabled={recording}
            onPress={() => handleRecord(entry.label)}
          />
        </View>
      ))}

      {recording && (
        <View style={styles.card}>
          <ActivityIndicator />
          <Text style={styles.cardHint}>Recording for 2.5 seconds...</Text>
        </View>
      )}

      {lastRecord && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Last recording</Text>
          <Text style={styles.mono}>{describe(lastRecord)}</Text>
        </View>
      )}

      {records.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>All recordings so far</Text>
          {Object.entries(summary).map(([label, group]) => (
            <Text key={label} style={styles.mono}>
              {label}: {group.count} recorded,{" "}
              {Math.round(group.acceptedRate * 100)}% accepted, tilt{" "}
              {group.averageCurrentTiltDeg.toFixed(1)}°, direction change{" "}
              {group.averageOrientationChangeDeg.toFixed(1)}°
            </Text>
          ))}
          <Button title="Share the numbers" onPress={handleShare} />
        </View>
      )}
    </ScrollView>
  );
}

/** Turns one recording into a short, readable line. */
function describe(record: MotionRecord): string {
  const { features, checks, status } = record;

  return [
    `verdict: ${status}`,
    `tilt at start: ${features.startTiltDeg.toFixed(1)}°`,
    `tilt at end: ${features.currentTiltDeg.toFixed(1)}°`,
    `direction change: ${features.orientationChangeDeg.toFixed(1)}°`,
    `total turning: ${features.rotationPathDeg.toFixed(1)}°`,
    `moving ${Math.round(features.dutyCycle * 100)}% of the time`,
    `moving for ${Math.round(features.activeDurationMs)} ms`,
    `not resting: ${checks.notResting ? "yes" : "no"}`,
    `picked up: ${checks.reoriented ? "yes" : "no"}`,
    `kept moving: ${checks.continuous ? "yes" : "no"}`
  ].join("\n");
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "white"
  },
  content: {
    padding: 24,
    gap: 16
  },
  title: {
    fontSize: 24,
    fontWeight: "600"
  },
  intro: {
    fontSize: 14,
    lineHeight: 20
  },
  card: {
    gap: 8,
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#F2F2F7"
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600"
  },
  cardHint: {
    fontSize: 13,
    color: "#6E6E73"
  },
  mono: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: "Courier"
  }
});
