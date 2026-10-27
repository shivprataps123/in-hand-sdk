import React from "react";
// 1. Import Label and Icon directly from the unstable entry point
import { Colors } from "@/constants/theme";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { useColorScheme } from "react-native";

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === "dark" ? "dark" : "light"];

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.backgroundElement}
      labelStyle={{ selected: { color: colors.text } }}
    >
      {/* 2. Place <Label> and <Icon> directly inside <NativeTabs.Trigger> */}
      <NativeTabs.Trigger name="index">
        <Label>Home</Label>
        <Icon
          androidSrc={require("@/assets/images/tabIcons/home.png")}
          sf="house.fill" // It's recommended to provide an SF Symbol fallback for iOS
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
