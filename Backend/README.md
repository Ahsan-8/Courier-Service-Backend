# Courier-Service-Backend

A backend service for a courier/delivery application built with Node.js, Express, and MongoDB.

## Features

- Customer, Rider, and Admin role-based authentication (JWT)
- Order creation, tracking, and status updates
- Rider application, approval workflow, and geo-location
- Geo-spatial queries for nearby riders
- Role-based access control
- Zod-based input validation on all routes
- Socket.IO for real-time updates
- Double-entry ledger for financial settlement

## Tech Stack

- Node.js + Express 5.x
- MongoDB + Mongoose ODM
- JWT + Refresh Token authentication
- bcryptjs for password hashing
- **Zod** — Runtime schema validation
- Socket.IO for real-time updates (with Redis adapter for multi-node scaling)
- Nodemailer for email (SMTP)
- BullMQ + Redis for background notification queue

## Validation Layer

All request payloads are validated by Zod schemas before reaching controllers. Validation is mounted directly on routes right after authentication:

```text
Incoming Request → Auth Middleware → Zod Validation → Controller → Business Logic
```

On failure, a standardized `400 Bad Request` is returned with field-level errors:

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    { "field": "packageDetails.weightKG", "message": "Weight must be greater than 0" }
  ]
}
```

Schema definitions live in `src/validators/`:
- `auth.validator.js` — register, login, forgot/reset password, OTP
- `order.validator.js` — create order, assign rider, status updates, reject, reassign, mark failed
- `rider.validator.js` — apply, approve/reject, deactivate, toggle online, update location, nearby query
- `wallet.validator.js` — payout disbursement

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
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
CLIENT_URL=http://localhost:3000
REDIS_URL=redis://127.0.0.1:6379
```

## Run

```bash
npm run dev       # nodemon
npm start         # production
npm run seed      # seed test data
```

## API Routes

### Auth (`/api/auth`)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/register` | Register new user |
| POST | `/login` | Login with email + password |
| POST | `/refresh-token` | Refresh access token via cookie |
| POST | `/logout` | Logout, revoke refresh token |
| POST | `/forget-password` | Send OTP to email for password reset |
| POST | `/reset-password` | Reset password using OTP |

### Orders (`/api/orders`)
| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| POST | `/` | CUSTOMER | Create new order |
| GET | `/` | Any auth | List orders (filtered by role) |
| GET | `/:id` | Owner/Admin | Get order by ID |
| GET | `/tracking/:trackingId` | Public | Track order by tracking ID |
| PATCH | `/:id/assign` | ADMIN | Assign rider to order |
| PATCH | `/:id` | ADMIN, RIDER | Update order status |
| PATCH | `/:id/status` | ADMIN, RIDER | Transition order status (state machine) |
| POST | `/:id/reject` | RIDER | Rider rejects assigned order |
| POST | `/:id/failed` | RIDER | Rider marks delivery failed |
| POST | `/:id/reassign` | ADMIN | Reassign order to new rider |

### Rider (`/api/rider`)
| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| POST | `/apply` | Public | Submit rider application |
| GET | `/applications` | ADMIN | List pending applications |
| PATCH | `/application/:riderId/approve` | ADMIN | Approve/reject application |
| PATCH | `/:id/review` | ADMIN | Review rider application |
| PATCH | `/:id/deactivate` | ADMIN | Deactivate/reactivate rider |
| GET | `/profile` | RIDER | Rider profile |
| PATCH | `/availability` | RIDER | Toggle online/offline |
| PATCH | `/toggle-online` | RIDER | Set availability explicitly |
| PATCH | `/location` | RIDER | Update GPS location |
| GET | `/stats` | RIDER | Rider performance stats |
| GET | `/nearby` | ADMIN | Geo-nearby available riders |
| POST | `/orders/:orderId/accept` | RIDER | Accept assigned order |
| POST | `/orders/:orderId/complete` | RIDER | Complete order delivery |
| POST | `/orders/:orderId/reject` | RIDER | Reject assigned order |

### OTP (`/api/otp`)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/send-otp` | Generate + store OTP |
| POST | `/verify-otp` | Verify OTP |

### Wallet (`/api/wallet`)
| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| GET | `/me` | Any auth | Get wallet balance + recent ledger entries |
| GET | `/ledger` | Any auth | Paginated ledger audit entries |
| POST | `/reconcile` | Any auth | Reconcile wallet balance against ledger |
| POST | `/disburse` | ADMIN | Trigger payout disbursement |
| GET | `/payout-batches` | ADMIN | Platform-wide payout batch history |

### Notifications (`/api/notifications`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Any auth | Paginated notifications with unread count |
| PATCH | `/:id/read` | Any auth | Mark notification as read |
| PATCH | `/read-all` | Any auth | Mark all notifications as read |

## Notes

- In development mode (`NODE_ENV=development`), emails are logged to console instead of sent
- OTP expiry, resend cooldown, and max attempts are enforced
- Refresh token rotation with reuse detection protects against token theft
- Socket.IO enables real-time location updates and order tracking rooms
- If Redis is unavailable, notifications run inline instead of via BullMQ queue