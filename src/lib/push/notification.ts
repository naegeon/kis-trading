import webpush from 'web-push';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { PushSubscription } from '@/lib/validations/push';
import { log } from '@/lib/logger';

// Configure web-push with VAPID keys
const vapidKeys = {
  publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  privateKey: process.env.VAPID_PRIVATE_KEY!,
};

webpush.setVapidDetails(
  'mailto:your-email@example.com', // TODO: Replace with a real email address
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

export async function sendPushNotification(userId: string, title: string, body: string, url: string = '/') {
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: {
        pushSubscription: true,
      },
    });

    if (!user || !user.pushSubscription) {
      await log('INFO', `No push subscription found for user ${userId}`, {}, userId);
      return;
    }

    const subscription = user.pushSubscription as PushSubscription;

    const payload = JSON.stringify({
      title,
      body,
      url,
    });

    await webpush.sendNotification(subscription, payload);
    await log('INFO', `Push notification sent to user ${userId}`, {}, userId);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown push notification error';
    await log('ERROR', `Failed to send push notification to user ${userId}`, { error: errorMessage }, userId);
    
    if (error instanceof Error && (error.message.includes('410') || error.message.includes('404'))) { // GCM/FCM returns 410/404 for expired/invalid subscriptions
      await log('INFO', `Subscription for user ${userId} is expired or invalid, removing from DB.`, {}, userId);
      await db.update(users)
        .set({ pushSubscription: null })
        .where(eq(users.id, userId));
    }
  }
}