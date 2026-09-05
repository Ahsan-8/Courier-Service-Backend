import express from 'express';
import http from 'http';
import { server } from 'socket.io';
import dotenv from 'dotenv';
import cors from 'cors';

import { connectDB } from "./src/config/db.js";
import authRoutes from './src/routes/Auth.js';
import orderRoutes from './src/routes/orderRoute.js';
import riderRoutes from './src/routes/riderRoute.js';
import adminRoutes from './src/routes/adminRoute.js';

dotenv.config();
connectDB();

const app = express();

app.use(cors());
app.use(express.json());

const server = http.createServer(app);
export const io = new server(server, {
    cors: {
        origin: '*',
        method: ['GET', 'POST'],
    }
});

io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);
    socket.on('join_order_room', (orderId) => {
        socket.join(`order ${orderId}`);
        console.log(`Socket ${socket.id} joined room: order_${orderId}`)
    });
});

socket.on('update_location', (data) => {
    const { orderId, riderId, latitude, longitude } = data;
    io.to(`order_${orderId}`).emit(`rider_location_update`, {
        orderId,
        riderId,
        coordinate: [longitude, tatitude],
        timestamp: new Date(),
    });
});

socket.on(`disconnected`, () => {
    console.log(`Socket disconnectet ${socket.id}`);
});

app.use("/api/auth", authRoutes);
app.use("/api/orders", orderRoutes);
app.use('/api/rider', riderRoutes);
app.use('/api/admin', adminRoutes);

app.get("/", (req, res) => {
    res.json({ message: 'Courier API & Real-Time Socket Service running...' });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
});