import express from 'express';
import http from 'http';
import dotenv from 'dotenv';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { Server } from 'socket.io';
import Redis from 'ioredis';
import { createAdapter } from '@socket.io/redis-adapter';

import { connectDB } from "./src/config/db.js";
import { initSocket } from './src/utils/socket.js';
import authRoutes from './src/routes/Auth.js';
import orderRoutes from './src/routes/orderRoute.js';
import riderRoutes from './src/routes/riderRoute.js';
import adminRoutes from './src/routes/adminRoute.js';
import otpRouter from './src/routes/orpRouter.js';
import walletRoutes from './src/routes/walletRoutes.js';
import notificationRoutes from './src/routes/notificationRoutes.js';
import { startNotificationWorker, initNotificationQueue } from './src/queues/notificationQueue.js';

dotenv.config();
connectDB();

const app = express();

app.use(cors());
app.use(express.json());
app.use(cookieParser());

const server = http.createServer(app);
const io = initSocket(server);

// Redis adapter for multi-node Socket.IO scaling (graceful fallback if Redis unavailable)
const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
let redisAdapterEnabled = false;

function tryEnableRedisAdapter() {
  const pubClient = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
    retryStrategy: (times) => {
      if (times > 3) return null;
      return Math.min(times * 100, 3000);
    },
  });
  const subClient = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
    retryStrategy: (times) => {
      if (times > 3) return null;
      return Math.min(times * 100, 3000);
    },
  });

  // Suppress unhandled error events so the server never crashes without Redis
  pubClient.on('error', () => {});
  subClient.on('error', () => {});

  Promise.all([pubClient.connect(), subClient.connect()])
    .then(() => {
      io.adapter(createAdapter(pubClient, subClient));
      redisAdapterEnabled = true;
      console.log('[Socket.IO] Redis adapter enabled for multi-node scaling');

      // Initialize BullMQ queue + worker only once Redis is confirmed available
      initNotificationQueue({ url: redisUrl });
      startNotificationWorker({ url: redisUrl });
      console.log('[Queue] Notification worker started');
    })
    .catch((err) => {
      console.warn('[Socket.IO] Redis adapter disabled, using in-memory rooms:', err.message);
    });
}

tryEnableRedisAdapter();

io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);
    socket.on('join_order_room', (orderId) => {
        socket.join(`order_${orderId}`);
        console.log(`Socket ${socket.id} joined room: order_${orderId}`)
    });

    socket.on('update_location', (data) => {
        const { orderId, riderId, latitude, longitude } = data;
        io.to(`order_${orderId}`).emit(`rider_location_update`, {
            orderId,
            riderId,
            coordinate: [longitude, latitude],
            timestamp: new Date(),
        });
    });

    socket.on('disconnect', () => {
        console.log(`Socket disconnected ${socket.id}`);
    });
});

app.use("/api/auth", authRoutes);
app.use("/api/orders", orderRoutes);
app.use('/api/rider', riderRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/otp', otpRouter);
app.use("/api/wallet", walletRoutes);
app.use("/api/notifications", notificationRoutes);

app.get("/", (req, res) => {
    res.json({ message: 'Courier API & Real-Time Socket Service running...' });
});

// Global error handler - catches unhandled errors from all middleware/routes
app.use((error, req, res, next) => {
    console.error('[Global Error Handler]:', error.message);
    if (error.name === 'ValidationError' && error.errors) {
        const messages = Object.values(error.errors).map(e => e.message).join('. ');
        return res.status(400).json({ success: false, message: messages });
    }
    if (error.code === 11000) {
        const field = Object.keys(error.keyValue)[0];
        return res.status(400).json({ success: false, message: `${field} already exists` });
    }
    if (error instanceof SyntaxError && error.status === 400) {
        return res.status(400).json({ success: false, message: 'Invalid JSON body' });
    }
    const status = error.status || error.statusCode || 500;
    res.status(status).json({ success: false, message: error.message || 'Internal server error' });
});

// Handle uncaught exceptions to prevent silent crashes
process.on('uncaughtException', (err) => {
    console.error('[Uncaught Exception]:', err.message);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[Unhandled Rejection]:', reason);
    process.exit(1);
});

// Start background notification worker only if Redis is confirmed available.
// If Redis is missing, NotificationService.runInline() handles notifications directly.
if (redisAdapterEnabled) {
  console.log('[Queue] Notification worker active');
} else {
  console.log('[Queue] Redis not available - notifications will run inline');
}

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
});