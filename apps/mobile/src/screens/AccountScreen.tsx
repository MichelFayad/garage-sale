import { Button, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';

// Account tab — identity + sign out. Profile, card-on-file, and settings land P12.
export function AccountScreen() {
  const { user, logout } = useAuth();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Account</Text>
      <Text style={styles.label}>{user?.displayName}</Text>
      <Text style={styles.subtitle}>{user?.email}</Text>
      <View style={styles.spacer} />
      <Button title="Log out" onPress={() => void logout()} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 4 },
  title: { fontSize: 22, fontWeight: '600', marginBottom: 8 },
  label: { fontSize: 16, fontWeight: '500' },
  subtitle: { fontSize: 14, color: '#666' },
  spacer: { height: 16 },
});
