import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { faker } from '@faker-js/faker';

import User from './models/User.js';
import Rider from './models/Rider.js';
import Order from './models/Order.js';

const connectDB = async () => {
    try {
        console.log(`MongoDB connected for seeding ...`);
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

const seedData = async () => {
    try {
        await connectDB();
        // Clear Existing Data
        console.log(`Clearing existing user, rider and order...`);
        await User.deleteMany();
        await Rider.deleteMany();
        await Order.deleteMany();
        // Create Admin Account
        console.log(`Creating existing users...`);
        await User.create({
            name: 'System Admin',
            email: 'admin@gmail.com',
            phone: '01700000000',
            password: '12345678',
            role: 'ADMIN',
            isApproved: true,
        });
        // Create Customers
        console.log(`Customer creating...`);
        const customerUsers = [];
        for (let i = 0; i < 15; i++) {
            const user = await User.create({
                name: faker.person.fullname(),
                eamil: faker.internet.email().toLowerCase(),
                phone: faker.phone.number({ style: 'national' }),
                password: '12345678',
                role: 'Customer',
                isApproved: true,
            });
            customerUsers.push(user);
        };
        // Create Approved & Available Riders
        console.log(`Creating approved riders ...`);
        const approvedRiders = [];
        const vehicleTypes = ['BIKE', 'CAT', 'VAN', 'FOOT'];
        for (let i = 0; i < 15; i++) {
            const riderUser = await User.create({
                name: faker.person.fullName(),
                email: faker.internet.email().toLowerCase(),
                phone: faker.phone.number({ style: 'national' }),
                password: '12345678',
                role: 'RIDER',
                isApproved: true,
            });
            const rider = await Rider.create({
                user: riderUser._id,
                vehicleType: faker.helpers.arrayElement(vehicleTypes),
                licenseNumber: faker.string.alphanumeric(8).toUpperCase(),
                approvalStatus: 'APPROVED',
                isAvailable: true,
                currentLocation: {
                    type: 'Point',
                    coordinates: [
                        parseFloat(faker.location.longitude({ min: 90.3, max: 90.5 })),
                        parseFloat(faker.location.latitude({ min: 90.3, max: 90.5 })),
                    ],
                },
            });
            approvedRiders.push({ user: riderUser, riderProfile: rider });
        };

        // Create Pending Rider Applications
        console.log(`Creating pending rider applications...`);
        for (let i = 0; i < 15; i++) {
            const pendingUser = await User.create({
                name: faker.person.name(),
                email: faker.internet.email().toLowerCase(),
                phone: faker.phone.number(),
                password: '12345678',
                role: 'RIDER',
                isApproval: false,
            });
            await Rider.create({
                user: pendingUser._id,
                vehicleType: faker.helpers.arrayElement(vehicleTypes),
                licenseNumber: faker.string.alphanumeric(8).toUpperCase(),
                approvalStatus: 'PENDING',
                isAvailable: false,
            });
        }
        // Create Orders with Various Statuses & Payments
        console.log(`Creating Mock Orders...`);
        const orderStatuses = [
            'PENDING',
            'CONFIRMED',
            'RIDER_ASSIGNED',
            'PICKED_UP',
            'IN_TRANSIT',
            'OUT_FOR_DELIVERY',
            'DELIVERED',
            'DELIVERED',
            'DELIVERED',
            'CANCELLED',
        ];
        for (let i = 0; i < 30; i++) {
            const randomCustomer = faker.helpers.arrayElement(customerUsers);
            const randomRiderObj = faker.helpers.arrayElement(approvedRiders);
            const status = faker.helpers.arrayElement(orderStatuses);
            const paymentMethod = faker.helpers.arrayElement(['COD', 'PREPAID']);

            const paymentStatus = status === 'DELIVERED' ? 'PAID' : faker.helpers.arrayElement(['PENDING', 'PAID']);
            const deliveryFee = faker.number.int({ min: 40, max: 150 });
            const codAmount = paymentMethod === 'COD' ? faker.number.int({ min: 60, max: 500 }) : 0;
            await Order.create({
                customer: randomCustomer._id,
                rider: randomRiderObj._id,
                pickupDetails: {
                    address: {
                        street: faker.location.streetAddress(),
                        city: faker.location.city(),
                        coordinates: [
                            parseFloat(faker.location.longitude({ min: 90.3, max: 90.5 })),
                            parseFloat(faker.location.latitude({ min: 90.3, max: 90.5 })),
                        ],
                    },
                },
                deliveryDetails: {
                    address: {
                        street: faker.location.streetAddress(),
                        city: faker.location.city(),
                        coordinates: [
                            parseFloat(faker.location.longitude({ min: 90.3, max: 90.5 })),
                            parseFloat(faker.location.latitude({ min: 90.3, max: 90.5 })),
                        ],
                    },
                },
                packageDetails: {
                    weightKG: faker.number.float({ min: 0.1, max: 5, fractionDigits: 1 }),
                    catagory: faker.string.arrayElement(['DOCUMENTS', 'FRAGILE', 'ELECTRONICS', 'CLOTHING', 'HEAVY', 'PARCEL']),
                },
                pricing: {
                    deliveryFee,
                    codAmount,
                    paymentMethod,
                    paymentStatus,
                },
                status,
                statusHistory: [
                    { status: 'PENDING', timestamp: faker.date.recent({ days: 5 }) },
                    ...(status !== 'PENDING' ? [{ status, timestamp: new Date() }] : []),
                ],
                createdAt: faker.date.recent({ days: 7}),
            });
        }

        console.log(`Data Seeding Completed Successfully!`);
        console.log(`\n Sample Admin Credentials`);
        console.log(`Email: admin@gmail.com`);
        console.log(`Password: 12345678`);
        process.exit();
    } catch (error) {
        console.error(`Seeding Error: ${error.message}`);
        process.exit(1);
    }
};
seedData();
