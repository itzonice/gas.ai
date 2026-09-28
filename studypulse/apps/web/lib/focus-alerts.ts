// Browser side of the timer-end alerts (launch audit L4): the chime is generated with Web
// Audio from CHIME in @studypulse/core/screens (no audio file), and the notification only
// shows when this tab is in the background and the student allowed notifications.
import { CHIME, CHIME_VOLUME } from "@studypulse/core/screens";

let audio: AudioContext | null = null;

/** Plays the end-of-timer chime. Silent (never throws) where audio isn't available. */
export function playChime() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audio ??= new Ctx();
    const ctx = audio;
    void ctx.resume().catch(() => undefined);
    const t0 = ctx.currentTime + 0.02;
    for (const note of CHIME) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = note.frequency;
      // A soft attack and a long fade, so it's a chime rather than a beep.
      gain.gain.setValueAtTime(0, t0 + note.start);
      gain.gain.linearRampToValueAtTime(CHIME_VOLUME, t0 + note.start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + note.start + note.duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + note.start);
      osc.stop(t0 + note.start + note.duration + 0.05);
    }
  } catch {
    // No audio (blocked autoplay, old browser): the on-screen and spoken messages remain.
  }
}

export const notificationsSupported = () =>
  typeof window !== "undefined" && "Notification" in window;

/** Asks for permission (call from a click). Resolves to whether notifications may show. */
export async function allowNotifications(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  return (await Notification.requestPermission()) === "granted";
}

/** Shows a notification if this tab is hidden and permission was given. */
export function notifyIfHidden(title: string, body: string) {
  if (!notificationsSupported() || document.visibilityState !== "hidden") return;
  if (Notification.permission !== "granted") return;
  try {
    const n = new Notification(title, { body, tag: "studypulse-focus" });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    // Some browsers only allow notifications from a service worker; skip quietly.
  }
}
