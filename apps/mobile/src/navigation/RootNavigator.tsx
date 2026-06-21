import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { LoginScreen } from '../screens/LoginScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { TabNavigator } from './TabNavigator';

// Auth gate: a spinner while hydrating, the login/register flow when signed out,
// and the authenticated tab shell once signed in. Real screens land P12.
export function RootNavigator() {
  const { status } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');

  if (status === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (status === 'authenticated') {
    return <TabNavigator />;
  }

  return mode === 'login' ? (
    <LoginScreen onSwitchToRegister={() => setMode('register')} />
  ) : (
    <RegisterScreen onSwitchToLogin={() => setMode('login')} />
  );
}
