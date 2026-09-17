import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { faker } from '@faker-js/faker';

import User from './models/User.js';
import Rider from './models/Rider.js';
import Order from './models/Order.js';

dotenv.config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log(`MongoDB connected for seeding...`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

const seedData = async () => {
  try {
    await connectDB();

    // Clear Existing Data
    console.log(`Clearing existing users, riders, and orders...`);
    await User.deleteMany();
    await Rider.deleteMany();
    await Order.deleteMany();

    // Create Admin Account
    console.log(`Creating Admin account...`);
    await User.create({
      name: 'System Admin',
      email: 'admin@gmail.com',
      phone: '01700000000',
      password: '12345678',
      role: 'ADMIN',
      isApproved: true,
    });

    // Create Customers
    console.log(`Creating Customers...`);
    const customerUsers = [];
    for (let i = 0; i < 15; i++) {
      const user = await User.create({
        name: faker.person.fullName(),
        email: faker.internet.email().toLowerCase(),
        phone: faker.phone.number({ style: 'national' }),
        password: '12345678',
        role: 'CUSTOMER',
        isApproved: true,
      });
      customerUsers.push(user);
    }

    // Create Approved & Available Riders
    console.log(`Creating Approved Riders...`);
    const approvedRiders = [];
    const vehicleTypes = ['BIKE', 'CAR', 'VAN', 'FOOT'];

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
            parseFloat(faker.location.latitude({ min: 23.7, max: 23.9 })),
          ],
        },
      });
      approvedRiders.push({ user: riderUser, riderProfile: rider });
    }

    // Create Pending Rider Applications
    console.log(`Creating Pending Rider Applications...`);
    for (let i = 0; i < 15; i++) {
      const pendingUser = await User.create({
        name: faker.person.fullName(),
        email: faker.internet.email().toLowerCase(),
        phone: faker.phone.number({ style: 'national' }),
        password: '12345678',
        role: 'RIDER',
        isApproved: false,
      });

      await Rider.create({
        user: pendingUser._id,
        vehicleType: faker.helpers.arrayElement(vehicleTypes),
        licenseNumber: faker.string.alphanumeric(8).toUpperCase(),
        approvalStatus: 'PENDING',
        isAvailable: false,
      });
    }

    // Create Mock Orders
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

      const paymentStatus =
        status === 'DELIVERED'
          ? 'PAID'
          : faker.helpers.arrayElement(['PENDING', 'PAID']);
      const deliveryFee = faker.number.int({ min: 40, max: 150 });
      const codAmount =
        paymentMethod === 'COD' ? faker.number.int({ min: 60, max: 500 }) : 0;

      await Order.create({
        customer: randomCustomer._id,
        rider: status !== 'PENDING' ? randomRiderObj.riderProfile._id : null,
        pickupDetails: {
          name: faker.person.fullName(),
          phone: faker.phone.number({ style: 'national' }),
          address: `${faker.location.streetAddress()}, ${faker.location.city()}`,
        },
        deliveryDetails: {
          name: faker.person.fullName(),
          phone: faker.phone.number({ style: 'national' }),
          address: `${faker.location.streetAddress()}, ${faker.location.city()}`,
        },
        packageDetails: {
          weightKG: faker.number.float({ min: 0.1, max: 5, fractionDigits: 1 }),
          description: faker.lorem.word(),
          category: faker.helpers.arrayElement([
            'DOCUMENTS', 'FRAGILE', 'ELECTRONICS', 'CLOTHING', 'HEAVY', 'PARCEL'
          ]),
        },
        pricing: {
          deliveryFee,
          codAmount,
          paymentMethod,
          paymentStatus,
        },
        status,
        statusHistory: [
          { status: 'PENDING', updatedAt: faker.date.recent({ days: 5 }), updatedBy: randomCustomer._id },
          ...(status !== 'PENDING' ? [{ status, updatedAt: new Date(), updatedBy: randomRiderObj.riderProfile._id }] : []),
        ],
        createdAt: faker.date.recent({ days: 7 }),
      });
    }

    console.log(`\nData Seeding Completed Successfully!`);
    console.log(`\nSample Admin Credentials`);
    console.log(`Email: admin@gmail.com`);
    console.log(`Password: 12345678\n`);
    process.exit();
  } catch (error) {
    console.error(`Seeding Error: ${error.message}`);
    process.exit(1);
  }
};

seedData();