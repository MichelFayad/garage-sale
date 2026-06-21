// Native social sign-in: Google + Facebook via expo-auth-session, Apple via the
// native expo-apple-authentication module. Each yields a provider token that is
// exchanged for our JWT through AuthContext.signInWithProvider.

import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as Facebook from 'expo-auth-session/providers/facebook';
import * as Google from 'expo-auth-session/providers/google';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import { useAuth } from './AuthContext';

WebBrowser.maybeCompleteAuthSession();

export function useSocialAuth() {
  const { signInWithProvider } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const [, googleResponse, googlePrompt] = Google.useIdTokenAuthRequest({
    clientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '',
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  });

  const [, facebookResponse, facebookPrompt] = Facebook.useAuthRequest({
    clientId: process.env.EXPO_PUBLIC_FACEBOOK_CLIENT_ID ?? '',
  });

  useEffect(() => {
    if (googleResponse?.type === 'success') {
      const idToken = googleResponse.params.id_token;
      if (idToken) {
        void signInWithProvider({ provider: 'GOOGLE', idToken }).catch((e) => setError(String(e)));
      }
    }
  }, [googleResponse, signInWithProvider]);

  useEffect(() => {
    if (facebookResponse?.type === 'success') {
      const accessToken = facebookResponse.authentication?.accessToken;
      if (accessToken) {
        void signInWithProvider({ provider: 'FACEBOOK', accessToken }).catch((e) =>
          setError(String(e)),
        );
      }
    }
  }, [facebookResponse, signInWithProvider]);

  async function signInApple(): Promise<void> {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (credential.identityToken) {
        await signInWithProvider({ provider: 'APPLE', idToken: credential.identityToken });
      }
    } catch (e) {
      setError(String(e));
    }
  }

  return {
    error,
    signInGoogle: () => googlePrompt(),
    signInFacebook: () => facebookPrompt(),
    signInApple,
    appleAvailable: Platform.OS === 'ios',
  };
}
