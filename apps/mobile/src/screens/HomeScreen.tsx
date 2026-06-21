import { Button, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';

// Placeholder authenticated landing. The full User Portal (listings, trades,
// messaging, …) is built natively in P12.
export function HomeScreen() {
  const { user, logout } = useAuth();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome, {user?.displayName}</Text>
      <Text style={styles.subtitle}>{user?.email}</Text>
      <Button title="Log out" onPress={() => void logout()} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fff',
  },
  title: { fontSize: 22, fontWeight: '600' },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 12 },
});
