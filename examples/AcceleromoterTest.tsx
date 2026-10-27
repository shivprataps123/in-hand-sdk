import { Accelerometer } from "expo-sensors";
import React, { useEffect, useState } from "react";
import { Button, Text, View } from "react-native";

export default function AccelerometerTest() {
  const [available, setAvailable] = useState("Checking...");
  const [reading, setReading] = useState("Waiting for readings...");
  const [count, setCount] = useState(0);

  useEffect(() => {
    let subscription: { remove: () => void } | undefined;
    let active = true;

    async function start() {
      try {
        const isAvailable = await Accelerometer.isAvailableAsync();

        if (!active) return;
        setAvailable(String(isAvailable));

        if (!isAvailable) return;

        Accelerometer.setUpdateInterval(200);

        subscription = Accelerometer.addListener((data) => {
          if (!active) return;

          setCount((previous) => previous + 1);
          setReading(JSON.stringify(data));
          console.log("ACCELEROMETER EVENT:", data);
        });
      } catch (error) {
        setAvailable(`Error: ${String(error)}`);
      }
    }

    start();

    return () => {
      active = false;
      subscription?.remove();
    };
  }, []);

  return (
    <View style={{ padding: 24, gap: 16 }}>
      <Text>Accelerometer available: {available}</Text>
      <Text>Events received: {count}</Text>
      <Text>Latest reading: {reading}</Text>
      <Button title="Reset event counter" onPress={() => setCount(0)} />
    </View>
  );
}
