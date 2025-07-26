// Minimal service worker for push
self.addEventListener("push", event => {
  const data = event.data?.json() || {};
  const { title, body, icon, image, url } = data;
  const options = { body, icon, image, data: { url } };
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(clients.openWindow(url));
});
