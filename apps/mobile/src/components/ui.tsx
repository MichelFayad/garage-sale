// Shared UI primitives for the native User Portal — a small design system so the
// feature screens (P12) stay consistent without pulling in a component library.

import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

export const colors = {
  text: '#111',
  muted: '#555',
  faint: '#888',
  border: '#ddd',
  bg: '#fff',
  accent: '#2563eb',
  danger: '#b00020',
  success: '#0a7',
  chip: '#eef',
};

export function PrimaryButton({
  title,
  onPress,
  disabled,
  busy,
  tone = 'accent',
}: {
  title: string;
  onPress(): void;
  disabled?: boolean;
  busy?: boolean;
  tone?: 'accent' | 'danger' | 'neutral';
}) {
  const bg = tone === 'danger' ? colors.danger : tone === 'neutral' ? '#444' : colors.accent;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || busy}
      onPress={onPress}
      style={[styles.btn, { backgroundColor: bg }, (disabled || busy) && styles.btnDisabled]}
    >
      {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{title}</Text>}
    </Pressable>
  );
}

export function SecondaryButton({
  title,
  onPress,
  disabled,
}: {
  title: string;
  onPress(): void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.btnOutline, disabled && styles.btnDisabled]}
    >
      <Text style={styles.btnOutlineText}>{title}</Text>
    </Pressable>
  );
}

export function Field({ label, ...props }: { label: string } & TextInputProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput style={styles.input} placeholderTextColor={colors.faint} {...props} />
    </View>
  );
}

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'accent' }) {
  return (
    <View style={[styles.badge, tone === 'accent' && { backgroundColor: colors.chip }]}>
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

export function Card({ children, onPress }: { children: ReactNode; onPress?(): void }) {
  if (onPress) {
    return (
      <Pressable accessibilityRole="button" onPress={onPress} style={styles.card}>
        {children}
      </Pressable>
    );
  }
  return <View style={styles.card}>{children}</View>;
}

export function Centered({ children }: { children: ReactNode }) {
  return <View style={styles.centered}>{children}</View>;
}

export function Loading() {
  return (
    <Centered>
      <ActivityIndicator size="large" />
    </Centered>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <Text accessibilityRole="alert" style={styles.error}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  btn: { borderRadius: 8, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  btnOutline: {
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnOutlineText: { color: colors.text, fontSize: 16, fontWeight: '500' },
  field: { gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: '500', color: colors.muted },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.text,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#eee',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 11, color: colors.muted, fontWeight: '500' },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    gap: 6,
    backgroundColor: '#fff',
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  error: { color: colors.danger, fontSize: 14 },
});
