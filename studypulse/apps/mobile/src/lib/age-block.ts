// Remembers an under-13 attempt on this device for a day (launch safety S12), so the
// age question can't simply be answered again with a different year.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AGE_BLOCK_KEY, stillBlocked } from "@studypulse/core/auth";

export async function recordAgeBlock(): Promise<void> {
  await AsyncStorage.setItem(AGE_BLOCK_KEY, String(Date.now())).catch(() => undefined);
}

export async function ageBlocked(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(AGE_BLOCK_KEY).catch(() => null);
  return stillBlocked(raw === null ? null : Number(raw));
}
