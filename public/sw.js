// public/sw.js

self.addEventListener('push', function(event) {
  const data = event.data.json();
  console.log('Push received:', data);

  const title = data.title || 'KIS-Trader Notification';
  const options = {
    body: data.body || 'You have a new notification.',
    icon: '/icon-192x192.png', // Note: Ensure this icon exists in /public
    badge: '/badge-72x72.png', // Note: Ensure this badge exists in /public
    data: {
      url: data.url || '/', // URL to open when notification is clicked
    },
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close(); // Close the notification

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      // Check if there's a window open
      if (clientList.length > 0) {
        let client = clientList[0];
        // Find the focused window
        for (let i = 0; i < clientList.length; i++) {
          if (clientList[i].focused) {
            client = clientList[i];
          }
        }
        // Navigate the focused window to the notification's URL
        if (event.notification.data && event.notification.data.url) {
          return client.navigate(event.notification.data.url).then(client => client.focus());
        }
        // If no URL, just focus the window
        return client.focus();
      }
      // If no window is open, open a new one to the notification's URL
      if (event.notification.data && event.notification.data.url) {
        return clients.openWindow(event.notification.data.url);
      }
      // Fallback to opening the root URL
      return clients.openWindow('/');
    })
  );
});
