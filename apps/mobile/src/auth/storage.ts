// JWT token storage backed by the device keychain/keystore (expo-secure-store).

import * as SecureStore from 'expo-secure-store';

const ACCESS_KEY = 'gs_access_token';
const REFRESH_KEY = 'gs_refresh_token';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export async function saveTokens(tokens: TokenPair): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_KEY, tokens.accessToken),
    SecureStore.setItemAsync(REFRESH_KEY, tokens.refreshToken),
  ]);
}

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_KEY);
}

export async function clearTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_KEY),
    SecureStore.deleteItemAsync(REFRESH_KEY),
  ]);
}
