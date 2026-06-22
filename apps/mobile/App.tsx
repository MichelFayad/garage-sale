import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet } from 'react-native';
import { StripeProvider } from '@stripe/stripe-react-native';
import { AuthProvider } from './src/auth/AuthContext';
import { RootNavigator } from './src/navigation/RootNavigator';

// Full native User Portal (P12). StripeProvider enables the card-on-file
// PaymentSheet for the per-post publish charge; the publishable key is public.
const stripePublishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

export default function App() {
  return (
    <StripeProvider publishableKey={stripePublishableKey}>
      <AuthProvider>
        <SafeAreaView style={styles.root}>
          <RootNavigator />
          <StatusBar style="auto" />
        </SafeAreaView>
      </AuthProvider>
    </StripeProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
});
