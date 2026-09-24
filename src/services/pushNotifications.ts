import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

import { supabase } from '../lib/supabase';

export async function registerForPushNotifications(userId: string) {

  // Android notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  // Check current permission
  const { status: existingStatus } =
    await Notifications.getPermissionsAsync();

  let finalStatus = existingStatus;

  // Ask user if we don't already have permission
  if (existingStatus !== 'granted') {
    const { status } =
      await Notifications.requestPermissionsAsync();

    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Push notification permission was not granted.');
    return null;
  }

  // Get Expo project ID
  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId ??
    Constants?.easConfig?.projectId;

  if (!projectId) {
    throw new Error('Expo project ID not found.');
  }

  // Get this phone's push token
  const token = (
    await Notifications.getExpoPushTokenAsync({
      projectId,
    })
  ).data;

  console.log('Expo push token:', token);

  // Save it in Supabase
  const { error } = await supabase
    .from('profiles')
    .update({
      expo_push_token: token,
    })
    .eq('id', userId);

  if (error) {
    console.error(
      'Unable to save push token:',
      error
    );

    throw error;
  }

  return token;
}
