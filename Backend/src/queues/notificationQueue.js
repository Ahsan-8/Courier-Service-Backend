import { Queue, Worker } from 'bullmq';

let notificationQueue = null;
let workerInstance = null;

export const getNotificationQueue = () => notificationQueue;

export const initNotificationQueue = (redisOptions) => {
  if (notificationQueue) return notificationQueue;
  try {
    notificationQueue = new Queue('notifications', { connection: redisOptions });
    notificationQueue.on('error', (err) => console.warn('[Queue] Error:', err.message));
    return notificationQueue;
  } catch (err) {
    console.warn('[Queue] Failed to create notification queue:', err.message);
    return null;
  }
};

export const startNotificationWorker = (redisOptions) => {
  if (workerInstance) return workerInstance;
  try {
    workerInstance = new Worker(
      'notifications',
      async (job) => {
        const { recipientUser, status, order, extraData } = job.data;

        // A. Create Persistent Database Inbox Entry
        if (recipientUser?._id) {
          const Notification = (await import('../models/Notification.js')).default;
          await Notification.create({
            recipient: recipientUser._id,
            title: `Order #${order.trackingId} ${status}`,
            message: `Your order status changed to ${status}.`,
            order: order._id,
            metadata: { status, extraData },
          });
        }

        // B. Dispatch Email with auto-retry on network failures
        if (recipientUser?.email) {
          const { EmailService } = await import('../services/emailService.js');
          await EmailService.sendOrderStatusEmail(recipientUser.email, status, order, extraData);
        }
      },
      {
        connection: redisOptions,
        removeOnComplete: { count: 1000 },
        removeOnFailed: { count: 5000 },
      }
    );
    workerInstance.on('failed', (job, err) =>
      console.error(`[Worker] Job ${job.id} failed:`, err.message)
    );
    workerInstance.on('completed', (job) =>
      console.log(`[Worker] Job ${job.id} completed`)
    );
    workerInstance.on('error', (err) =>
      console.warn('[Worker] Error:', err.message)
    );
    console.log('[Queue] Notification worker started');
    return workerInstance;
  } catch (err) {
    console.warn('[Queue] Failed to start notification worker:', err.message);
    return null;
  }
};