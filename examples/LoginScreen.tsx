/**
 * WHAT IS THIS FILE?
 * ------------------
 * A small, working example of how to use the In-Hand SDK: the "continue to login"
 * button checks that the phone is being held before letting the user through.
 *
 * WHY DOES IT EXIST?
 * -------------------
 * To show the intended flow:
 *   1. The user taps the button.
 *   2. We watch the phone for a couple of seconds.
 *   3. If the phone is in a hand, we let the user in. If not, we explain why in
 *      words the user understands.
 *
 * HOW DO I USE IT?
 * -----------------
 * Copy this file, replace the "TODO" at the bottom with your own sign-in code, and
 * you are done. Everything else in the app can stay exactly as it is.
 */

import { verifyPhoneInHand } from "@/verifyPhoneInHand";
import React, { useState } from "react";
import { ActivityIndicator, Button, Text, View } from "react-native";

export default function LoginScreen() {
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState("");

  async function handleLogin() {
    setChecking(true);
    setMessage("");

    try {
      // Watch the phone for 2.5 seconds. During that time the user should pick the
      // phone up and hold it - that is the moment the SDK looks for.
      const result = await verifyPhoneInHand({
        durationMs: 2500,
        sampleIntervalMs: 20
      });

      console.log("Verification result:", result);

      if (result.verified) {
        setMessage(
          "Thanks! We can see you are holding the phone, so you can continue."
        );

        // TODO: Call your real authentication API here.
      } else if (result.status === "likely_resting") {
        // The phone is still lying flat. This is the most common case, so it gets
        // its own friendly message.
        setMessage(
          "It looks like your phone is still lying on a table. Pick it up and hold it, then try again."
        );
      } else if (result.status === "likely_not_held") {
        // The phone moved, but not in a way that looks like a hand.
        setMessage(
          "Your phone moved, but it did not look like it was being held. Pick the phone up in your hand and try again."
        );
      } else if (result.status === "sensor_unavailable") {
        setMessage(
          "We cannot check motion on this device. Please continue without the check."
        );
      } else {
        // Any other outcome: use the sentence the SDK wrote for us.
        setMessage(result.reason);
      }
    } catch {
      setMessage("Verification failed. Please try again.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <View style={{ padding: 24, gap: 16, backgroundColor: "white" }}>
      <Text style={{ fontSize: 24, fontWeight: "600" }}>Login</Text>

      <Text>We will check your phone&apos;s motion before continuing.</Text>

      {checking ? (
        <ActivityIndicator />
      ) : (
        <Button title="Continue to login" onPress={handleLogin} />
      )}

      {!!message && <Text>{message}</Text>}
    </View>
  );
}
