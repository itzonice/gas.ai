// Service worker for web push reminders. The payload is the JSON built by
// webPushPayload() in packages/core/src/notify/webpush.ts:
//   { title, body, url?, tag?, data? }
self.addEventListener("push", (event) => {
  let message = { title: "StudyPulse", body: "" };
  try {
    if (event.data) message = event.data.json();
  } catch {
    // Not JSON: show the text as-is.
    message = { title: "StudyPulse", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(message.title, {
      body: message.body,
      tag: message.tag,
      icon: "/favicon.ico",
      data: { url: message.url || "/", ...message.data },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin);
  // Only ever open pages on this site.
  const url = target.origin === self.location.origin ? target.href : self.location.origin;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => w.url.startsWith(self.location.origin));
      if (open) return open.focus().then((w) => w.navigate(url));
      return self.clients.openWindow(url);
    }),
  );
});

// The browser rotated the subscription: tell the page (if open) to re-register it.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((windows) => {
      for (const w of windows) w.postMessage({ type: "pushsubscriptionchange" });
    }),
  );
});
