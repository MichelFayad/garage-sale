import { useState } from 'react';
import { Button, Pressable, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { authStyles as s } from './styles';

export function RegisterScreen({ onSwitchToLogin }: { onSwitchToLogin: () => void }) {
  const { register } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setError(null);
    setBusy(true);
    try {
      await register(email.trim().toLowerCase(), password, displayName.trim());
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign up failed');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <View style={s.container}>
        <Text style={s.title}>Check your email</Text>
        <Text style={s.notice}>
          We sent a verification link to {email}. Verify it, then log in.
        </Text>
        <Pressable onPress={onSwitchToLogin}>
          <Text style={s.link}>Back to log in</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <Text style={s.title}>Sign up</Text>
      <TextInput
        style={s.input}
        placeholder="Display name"
        value={displayName}
        onChangeText={setDisplayName}
      />
      <TextInput
        style={s.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={s.input}
        placeholder="Password (min 8 chars)"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {error ? <Text style={s.error}>{error}</Text> : null}
      <Button title={busy ? 'Creating…' : 'Create account'} onPress={onSubmit} disabled={busy} />
      <Pressable onPress={onSwitchToLogin}>
        <Text style={s.link}>Already have an account? Log in</Text>
      </Pressable>
    </View>
  );
}
