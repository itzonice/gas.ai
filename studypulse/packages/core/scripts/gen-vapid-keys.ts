// Prints a new VAPID key pair for web push. Run once per environment:
//   pnpm --filter @studypulse/core vapid:keys
// Put the public key in VAPID_PUBLIC_KEY (edge) and NEXT_PUBLIC_VAPID_PUBLIC_KEY (web),
// and the private key in VAPID_PRIVATE_KEY (`supabase secrets set`). Changing keys
// invalidates every existing browser subscription.
import { generateVapidKeys } from "../src/notify/webpush.ts";

const keys = await generateVapidKeys();
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
