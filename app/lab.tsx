/**
 * WHAT IS THIS FILE?
 * ------------------
 * The screen behind the "/lab" address in the app.
 *
 * WHAT IS IT FOR?
 * ---------------
 * It shows the Motion Lab, which is the screen used to measure how the SDK behaves on
 * a real phone. It is a development tool, so it is not part of the tab bar - open it
 * by typing "/lab" in the app (or with the developer menu).
 *
 * The screen itself lives in `examples/MotionLab.tsx` so that all the example code
 * stays together in one folder.
 */

import { ThemedView } from "@/components/themed-view";
import { Platform, Text } from "react-native";
import MotionLab from "../../examples/MotionLab";

export default function LabScreen() {
  return (
    <ThemedView style={{ flex: 1 }}>
      <MotionLab />
      {Platform.OS === "web" && (
        <Text style={{ padding: 16 }}>
          Note: motion sensors do not work in a web browser, so the numbers on
          this screen will be empty when running the app on the web.
        </Text>
      )}
    </ThemedView>
  );
}
