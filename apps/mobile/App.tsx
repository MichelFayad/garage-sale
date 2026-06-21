import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet } from 'react-native';
import { AuthProvider } from './src/auth/AuthContext';
import { RootNavigator } from './src/navigation/RootNavigator';

// P2-B: auth-gated shell — credentials + OAuth sign-in against the shared API,
// JWT stored in secure store. P12 builds the full native User Portal.
export default function App() {
  return (
    <AuthProvider>
      <SafeAreaView style={styles.root}>
        <RootNavigator />
        <StatusBar style="auto" />
      </SafeAreaView>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
});
