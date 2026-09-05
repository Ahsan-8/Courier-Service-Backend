# Courier-Service-Backend

A backend service for a courier/delivery application built with Node.js, Express, and MongoDB.

## Features

- Customer, Rider, and Admin role-based authentication (JWT)
- Order creation, tracking, and status updates
- Rider application, approval workflow, and geo-location
- Geo-spatial queries for nearby riders
- Role-based access control

## Tech Stack

- Node.js + Express
- MongoDB + Mongoose
- JWT for auth
- bcryptjs for password hashing
- Socket.IO for real-time updates

## Setup

```bash
npm install
```

Create a `.env` file:

```
PORT=5000
MONGODB_URI=your_mongodb_uri
JWT_SECRET=your_secret
NODE_ENV=development
```

## Run

```bash
npm run dev
```

## API Routes

### Auth
- `POST /api/auth/register`
- `POST /api/auth/login`

### Orders
- `POST /api/orders` (CUSTOMER)
- `GET /api/orders`
- `GET /api/orders/:id`
- `GET /api/orders/tracking/:trackingId` (public)
- `PATCH /api/orders/:id/assign` (ADMIN)
- `PATCH /api/orders/:id` (ADMIN, RIDER)

### Rider
- `POST /api/rider/apply`
- `GET /api/rider/applications` (ADMIN)
- `PATCH /api/rider/application/:riderId/approve` (ADMIN)
- `GET /api/rider/profile` (RIDER)
- `PATCH /api/rider/availability` (RIDER)
- `PATCH /api/rider/location` (RIDER)
- `GET /api/rider/nearby` (ADMIN)
