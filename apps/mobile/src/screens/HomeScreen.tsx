import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';

// Home tab — authenticated landing/dashboard stub. Listings, trades, and
// messaging summaries land with the full native User Portal in P12.
export function HomeScreen() {
  const { user } = useAuth();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome, {user?.displayName}</Text>
      <Text style={styles.subtitle}>
        Your listings, trades, and messages will appear here. Features land P12.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 8 },
  title: { fontSize: 22, fontWeight: '600' },
  subtitle: { fontSize: 14, color: '#666' },
});
