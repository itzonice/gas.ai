// What StudyPulse keeps on the phone besides the session: the focus timer run and its
// choices, and unsaved syllabus reviews. Cleared on sign-out and account deletion, so the
// next person to sign in on this phone starts clean (the web does the same). The age
// block (AGE_BLOCK_KEY) is left alone on purpose: it must outlast a sign-out.
import AsyncStorage from "@react-native-async-storage/async-storage";

export const APP_STORAGE_PREFIX = "studypulse.";

export async function clearAppStorage(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const ours = keys.filter((k) => k.startsWith(APP_STORAGE_PREFIX));
    if (ours.length) await AsyncStorage.multiRemove(ours);
  } catch {
    // Storage unavailable: nothing to clear.
  }
}
