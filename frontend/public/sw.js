// Service worker: shows Taskflow browser notifications (Web Push)
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data?.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Taskflow", {
      body: data.body || "",
      icon: "/icon-192.png",
      data: { url: data.url || "/dashboard" },
    })
  );
});

// Clicking the notification focuses an open Taskflow tab (or opens one)
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/dashboard", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((tabs) => {
      const tab = tabs.find((t) => t.url.startsWith(self.location.origin));
      if (tab) return tab.focus().then(() => tab.navigate(url));
      return self.clients.openWindow(url);
    })
  );
});
