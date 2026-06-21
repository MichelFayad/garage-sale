import { useState } from 'react';
import { Button, Pressable, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { useSocialAuth } from '../auth/useSocialAuth';
import { authStyles as s } from './styles';

export function LoginScreen({ onSwitchToRegister }: { onSwitchToRegister: () => void }) {
  const { login } = useAuth();
  const social = useSocialAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setError(null);
    setBusy(true);
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={s.container}>
      <Text style={s.title}>Log in</Text>
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
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {error ? <Text style={s.error}>{error}</Text> : null}
      <Button title={busy ? 'Logging in…' : 'Log in'} onPress={onSubmit} disabled={busy} />

      <Text style={s.divider}>or continue with</Text>
      <View style={s.social}>
        <Button title="Google" onPress={social.signInGoogle} />
        <Button title="Facebook" onPress={social.signInFacebook} />
        {social.appleAvailable ? <Button title="Apple" onPress={social.signInApple} /> : null}
      </View>
      {social.error ? <Text style={s.error}>{social.error}</Text> : null}

      <Pressable onPress={onSwitchToRegister}>
        <Text style={s.link}>Need an account? Sign up</Text>
      </Pressable>
    </View>
  );
}
