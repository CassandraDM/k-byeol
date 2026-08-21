// Web fallback for react-native-maps (which is native-only and breaks web
// bundling). Renders a simple placeholder; markers/callouts are no-ops.
// Metro picks this file automatically when bundling for the web.
import { forwardRef } from "react";
import { StyleSheet, Text, View } from "react-native";

export function Marker() {
  return null;
}

export function Callout() {
  return null;
}

const MapView = forwardRef<any, any>(function MapView({ style }, _ref) {
  return (
    <View style={[styles.map, style]}>
      <Text style={styles.text}>🗺️  Map is available on the mobile app</Text>
    </View>
  );
});

export default MapView;

const styles = StyleSheet.create({
  map: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EDE7FF",
    minHeight: 160,
  },
  text: {
    color: "#7A3FB0",
    fontSize: 14,
    padding: 16,
    textAlign: "center",
  },
});
