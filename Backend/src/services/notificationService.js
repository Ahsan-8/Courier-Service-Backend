import { getIO } from '../utils/socket.js';
import { getNotificationQueue } from '../queues/notificationQueue.js';

export class NotificationService {
  /**
   * Dispatches dual Email + Socket.IO notifications for all order events.
   * Socket.IO emissions are instant and synchronous; email + DB persistence
   * are offloaded to a BullMQ background worker so the API thread never blocks.
   */
  static async notifyOrderEvent({ order, status, recipientUser, extraData = {} }) {
    const payload = {
      orderId: order._id,
      trackingId: order.trackingId,
      status,
      updatedAt: new Date(),
      extra: extraData,
    };

    // 1. Instant Real-Time WebSocket Emission (synchronous, non-blocking I/O)
    try {
      const io = getIO();
      if (io) {
        // Broadcast to specific order tracking room
        io.to(`order_${order._id}`).emit('order_status_updated', payload);

        // Broadcast directly to customer's personal user room
        if (order.customer) {
          const customerId = order.customer._id || order.customer;
          io.to(`user_${customerId}`).emit('notification', {
            title: `Order Update: ${status}`,
            message: `Order #${order.trackingId} status changed to ${status}`,
            data: payload,
          });
        }
      }
    } catch (err) {
      console.error('[Socket Error]:', err.message);
    }

    // 2. Offload Database + Email Processing to BullMQ Queue (Non-blocking)
    const queue = getNotificationQueue();
    if (queue) {
      try {
        await queue.add('sendNotification', {
          order,
          status,
          recipientUser,
          extraData,
        }, {
          attempts: 3,             // Automatically retry 3 times on failure
          backoff: 5000,           // Wait 5s between retries
          removeOnComplete: true,  // Clean up Redis memory
        });
      } catch (queueError) {
        // Redis unavailable: fall back to direct execution so notifications still land
        console.warn('[Queue] Redis unavailable, running notification inline:', queueError.message);
        await NotificationService.runInline({ order, status, recipientUser, extraData });
      }
    } else {
      // Queue not initialized (Redis missing): run inline so notifications still land
      await NotificationService.runInline({ order, status, recipientUser, extraData });
    }
  }

  /**
   * Fallback that persists the notification and sends email directly when Redis is unavailable.
   */
  static async runInline({ order, status, recipientUser, extraData }) {
    try {
      const Notification = (await import('../models/Notification.js')).default;
      const { EmailService } = await import('./emailService.js');

      if (recipientUser?._id) {
        await Notification.create({
          recipient: recipientUser._id,
          title: `Order #${order.trackingId} ${status}`,
          message: `Your order status changed to ${status}.`,
          order: order._id,
          metadata: { status, extraData },
        });
      }
      if (recipientUser?.email) {
        await EmailService.sendOrderStatusEmail(recipientUser.email, status, order, extraData);
      }
    } catch (inlineErr) {
      console.error('[Inline Notification Error]:', inlineErr.message);
    }
  }
}