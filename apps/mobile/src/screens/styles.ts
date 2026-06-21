import { StyleSheet } from 'react-native';

// Minimal shared styling for the auth screens (full design system arrives P12).
export const authStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  title: { fontSize: 26, fontWeight: '600', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  error: { color: '#b00020', fontSize: 13 },
  notice: { color: '#0a7', fontSize: 14 },
  link: { color: '#2563eb', fontSize: 14, textAlign: 'center', marginTop: 8 },
  divider: { textAlign: 'center', color: '#999', marginVertical: 8 },
  social: { gap: 8 },
});
