import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { DEFAULT_POST_FEE_CENTS } from '@garage-sale/core';

// P0: app boots. P3 adds navigation + auth screens; P12 builds the full
// User Portal natively against the shared API.
export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Garage Sale</Text>
      <Text style={styles.subtitle}>
        Mobile shell. Post fee: ${(DEFAULT_POST_FEE_CENTS / 100).toFixed(2)}
      </Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  title: { fontSize: 28, fontWeight: '600' },
  subtitle: { fontSize: 14, color: '#666' },
});
