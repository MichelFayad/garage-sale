// Expo push registration. Requests permission, ensures an Android channel, and
// returns the device's Expo push token (or null if unavailable — simulator, denied
// permission, or no EAS projectId). The token is sent to the API by AuthContext.

import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

export async function registerForPushNotifications(): Promise<string | null> {
  // Push tokens are only issued on physical devices.
  if (!Device.isDevice) return null;

  const existing = await Notifications.getPermissionsAsync();
  let granted = existing.granted;
  if (!granted) {
    const requested = await Notifications.requestPermissionsAsync();
    granted = requested.granted;
  }
  if (!granted) return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  if (!projectId) return null; // not configured yet — run `eas init`

  try {
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return token.data;
  } catch {
    return null;
  }
}
