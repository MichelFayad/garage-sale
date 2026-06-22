import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { useNav } from '../navigation/NavContext';
import { PrimaryButton, SecondaryButton } from '../components/ui';

// Account tab — identity, blocked-traders management, and sign out. Card-on-file
// lands in the billing stage of P12.
export function AccountScreen() {
  const { user, logout } = useAuth();
  const { push } = useNav();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Account</Text>
      <Text style={styles.label}>{user?.displayName}</Text>
      <Text style={styles.subtitle}>{user?.email}</Text>
      <View style={styles.spacer} />
      <SecondaryButton title="Payment method" onPress={() => push({ name: 'paymentMethod' })} />
      <SecondaryButton title="Blocked traders" onPress={() => push({ name: 'blocks' })} />
      <PrimaryButton title="Log out" tone="neutral" onPress={() => void logout()} />
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
