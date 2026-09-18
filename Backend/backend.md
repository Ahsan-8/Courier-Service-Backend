# Backend Documentation

## Tech Stack
- Node.js + Express 5.x
- MongoDB + Mongoose ODM
- JWT + Refresh Token authentication
- bcryptjs for password hashing
- **Zod** — Runtime schema validation for request payloads
- Socket.IO for real-time updates (with Redis adapter for multi-node scaling)
- Nodemailer for email (SMTP)
- crypto for OTP generation
- BullMQ + Redis for background notification queue
- @socket.io/redis-adapter for Socket.IO multi-node clustering

## Architecture

### Directory Structure
```
Backend/
├── index.js                  # Entry point, Express app + Socket.IO server + Redis adapter
├── .env                      # Environment variables
├── package.json
├── src/
│   ├── config/
│   │   └── db.js            # MongoDB connection
│   ├── constants/
│   │   ├── orderConstants.js # ORDER_STATUS, USER_ROLES, ALLOWED_TRANSITIONS
│   │   └── zonesConstants.js # ZONES, DHAKA_SUBURBAN_DISTRICTS, resolveZone(), TARIFF_MATRIX
│   ├── controllers/
│   │   ├── AuthController.js  # Register, login, forgot/reset password, refresh, logout
│   │   ├── otpController.js  # OTP send/verify flows
│   │   ├── orderControllers.js # Order CRUD, assign rider, status updates, reject, reassign, mark failed
│   │   ├── RiderController.js # Rider application, profile, online toggle, accept/complete/reject orders
│   │   ├── adminController.js # Dashboard stats
│   │   ├── walletController.js # Wallet balance, ledger entries, payout disbursement, reconcile
│   │   └── notificationController.js # In-app notifications list, mark read
│   ├── models/
│   │   ├── User.js          # User with role enum (CUSTOMER, RIDER, ADMIN)
│   │   ├── Order.js         # Order with tracking, pricing, parcel, status history, pre-save pricing hook
│   │   ├── Rider.js         # Rider profile with geo-location, deactivation, activeOrderCount
│   │   ├── OTP.js           # OTP records with expiry + attempts
│   │   ├── RefreshToken.js  # JWT refresh tokens with rotation
│   │   ├── Wallet.js        # MerchantWallet, LedgerEntry, PayoutBatch (double-entry ledger)
│   │   └── Notification.js  # In-app notification inbox records
│   ├── routes/
│   │   ├── Auth.js          # /api/auth/* (register, login, refresh, logout, forget/reset)
│   │   ├── orderRoute.js    # /api/orders/* (protected)
│   │   ├── riderRoute.js    # /api/rider/* (mixed roles)
│   │   ├── adminRoute.js    # /api/admin/* (dashboard stats)
│   │   ├── orpRouter.js     # /api/otp/* (send-otp, verify-otp)
│   │   ├── walletRoutes.js  # /api/wallet/* (me, ledger, disburse, payout-batches, reconcile)
│   │   └── notificationRoutes.js # /api/notifications/* (list, mark read)
│   ├── middleware/
│   │   ├── auth.js          # JWT protect middleware
│   │   ├── role.js          # authorizeRoles() for RBAC
│   │   ├── validate.middleware.js # Generic Zod schema validation runner
│   │   └── walletValidation.js # Payout disbursement validation
│   ├── validators/           # Zod schema definitions per domain
│   │   ├── auth.validator.js
│   │   ├── order.validator.js
│   │   ├── rider.validator.js
│   │   └── wallet.validator.js
│   ├── services/
│   │   ├── emailService.js  # Nodemailer SMTP email sending + lifecycle templates
│   │   ├── orderService.js  # Order state transitions, rider rejection, reassign, delivery failure
│   │   ├── ledgerService.js # Double-entry ledger settlement + payout disbursement (ACID transactions)
│   │   ├── pricingEngineService.js # Parcel pricing engine (volumetric weight, zone tariffs, merchant ledger)
│   │   ├── riderService.js  # Rider workflow: online toggle, approval, deactivation, accept/complete/reject
│   │   └── notificationService.js # Socket.IO + BullMQ notification orchestrator
│   ├── queues/
│   │   └── notificationQueue.js # BullMQ queue + worker for async email + DB persistence
│   ├── utils/
│   │   ├── otp.js          # crypto.randomInt for OTP generation
│   │   ├── token.js        # Access + refresh token generation
│   │   ├── socket.js       # Socket.IO singleton init/get
│   │   ├── calculateFee.js # Legacy fee calculator
│   │   └── orderStateEngine.js # Role-based state transition validator
│   └── seeder.js            # Faker.js test data generation
```

## Authentication

### Token Strategy
- **Access Token**: JWT (7 days expiry), signed with `JWT_SECRET`
- **Refresh Token**: Random 40-byte hex, bcrypt-hashed and stored in DB, 7-day expiry
- **Cookie-based**: Refresh token stored in HttpOnly, Secure, SameSite=Strict cookie

### Auth Flow
1. Register via `POST /api/auth/register` → returns access token
2. Login via `POST /api/auth/login` → returns access token
3. Refresh via `POST /api/auth/refresh-token` → issues new access + refresh tokens (with rotation and reuse detection)
4. Logout via `POST /api/auth/logout` → revokes refresh token, clears cookie

### Role-Based Access Control (RBAC)
Roles: `CUSTOMER`, `RIDER`, `ADMIN`
- Middleware: `_id` from JWT → attach `req.user` → `authorizeRoles('ROLE')` checks
- Rider login blocked if `isApproved === false`
- Rider applications require admin approval before login

## API Endpoints

### Auth Routes (`/api/auth`)
| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| POST | `/register` | Public | Register new user |
| POST | `/login` | Public | Login with email + password |
| POST | `/refresh-token` | Public | Refresh access token via cookie |
| POST | `/logout` | Public | Logout, revoke refresh token |
| POST | `/forget-password` | Public | Send OTP to email for password reset |
| POST | `/reset-password` | Public | Reset password using OTP |

### Order Routes (`/api/orders`)
| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| POST | `/` | CUSTOMER | Create new order |
| GET | `/` | Any auth | List orders (filtered by role) |
| GET | `/:id` | Owner/Admin | Get order by ID |
| GET | `/tracking/:trackingId` | Public | Track order by tracking ID |
| PATCH | `/:id/assign` | ADMIN | Assign rider to order |
| PATCH | `/:id` | ADMIN, RIDER | Update order status |
| PATCH | `/:id/status` | Any auth | Transition order status (state machine) |
| POST | `/:id/reject` | RIDER | Rider rejects assigned order |
| POST | `/:id/failed` | RIDER | Rider marks delivery failed |
| POST | `/:id/reassign` | ADMIN | Reassign order to new rider |

### Rider Routes (`/api/rider`)
| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| POST | `/apply` | Public | Submit rider application |
| GET | `/applications` | ADMIN | List pending applications |
| PATCH | `/application/:riderId/approve` | ADMIN | Approve/reject application |
| PATCH | `/:id/review` | ADMIN | Review rider application (APPROVED/REJECTED) |
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

### OTP Routes (`/api/otp`)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/send-otp` | Generate + store OTP |
| POST | `/verify-otp` | Verify OTP |

### Wallet Routes (`/api/wallet`)
| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| GET | `/me` | Any auth | Get wallet balance + recent ledger entries |
| GET | `/ledger` | Any auth | Paginated ledger audit entries |
| POST | `/reconcile` | Any auth | Reconcile wallet balance against ledger |
| POST | `/disburse` | ADMIN | Trigger payout disbursement |
| GET | `/payout-batches` | ADMIN | Platform-wide payout batch history |

### Notification Routes (`/api/notifications`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Any auth | Paginated notifications with unread count |
| PATCH | `/:id/read` | Any auth | Mark notification as read |
| PATCH | `/read-all` | Any auth | Mark all notifications as read |

## Key Data Models

### User
```javascript
{
  name: String (required),
  email: String (required, unique),
  phone: String (unique),
  address: String,
  password: String (required, hashed),
  role: 'CUSTOMER' | 'RIDER' | 'ADMIN',
  isApproved: Boolean (default: true),
}
// Pre-save hook: hashes password with bcrypt
// comparePassword() instance method for credential verification
```

### Order
```javascript
{
  trackingId: String (required, unique),   // e.g. "TRk1632..."
  customer: ObjectId → User,
  rider: ObjectId → User (default: null),
  pickupDetails: { name, phone, address },
  deliveryDetails: { name, phone, address },
  pickupAddress: { district, area },
  deliveryAddress: { district, area },
  parcel: { actualWeight, dimensions: { length, width, height }, category, description },
  packageDetails: { weightKG, description, category },
  status: 'PENDING' | 'CONFIRMED' | 'RIDER_ASSIGNED' | 'PICKED_UP' | 'IN_TRANSIT' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED' | 'RETURNED' | 'FAILED' | 'PARTIAL_DELIVERY',
  failedDeliveryAttempts: Number (default: 0),
  financialsSettled: Boolean (default: false),
  pricing: {
    deliveryFee, codAmount, codAmountCollected, paymentMethod, paymentStatus,
    zone, billableWeightKg, baseFee, weightSurcharge, codFee,
    returnHandlingFee, netPayableToMerchant,
  },
  statusHistory: [{ status, userRole, reason, notes, timestamp, updatedBy }],
}
// Pre-save hook: recalculates pricing only on pricing-relevant field mutations
```

### Rider
```javascript
{
  user: ObjectId → User (unique),
  vehicleType: 'BIKE' | 'CAR' | 'VAN' | 'FOOT',
  licenseNumber: String (unique, uppercase),
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED',
  rejectionReason: String,
  isDeactivated: Boolean (default: false),  // Admin suspend flag
  isAvailable: Boolean (default: false),     // Must manually toggle ONLINE
  activeOrderCount: Number (default: 0, max: 1),  // Single active delivery limit
  totalCompletedDeliveries: Number (default: 0),
  currentLocation: { type: 'Point', coordinates: [lng, lat] },
}
// Index: 2dsphere on currentLocation
// Deactivated riders are blocked from login, forced offline, and barred from accepting orders
```

### OTP
```javascript
{
  identifier: String (email or phone, indexed),
  otpHash: String (bcrypt hashed),
  attempts: Number (default: 0),
  isUsed: Boolean (default: false),
  expiresAt: Date (auto-delete via TTL index),
}
```

### RefreshToken
```javascript
{
  user: ObjectId → User (indexed),
  tokenHash: String (bcrypt hashed),
  isRevoked: Boolean (default: false),
  expiresAt: Date (auto-delete via TTL index),
}
```

### MerchantWallet
```javascript
{
  merchant: ObjectId → User (unique, required),
  pendingBalance: Number (default: 0),   // Cash in transit
  availableBalance: Number (default: 0), // Ready for payout withdrawal
  withdrawnBalance: Number (default: 0), // Total lifetime remitted payout cash
  currency: String (default: 'BDT'),
}
```

### LedgerEntry
```javascript
{
  merchant: ObjectId → User (indexed),
  order: ObjectId → Order (indexed),
  payoutBatch: ObjectId → PayoutBatch (indexed),
  type: 'COD_COLLECTION' | 'DELIVERY_FEE' | 'WEIGHT_SURCHARGE' | 'COD_FEE' | 'RETURN_HANDLING_FEE' | 'PAYOUT_DISBURSEMENT' | 'MANUAL_ADJUSTMENT',
  entryType: 'CREDIT' | 'DEBIT',
  amount: Number (required),
  balanceAfter: Number (required),  // Snapshot of available balance after entry
  description: String (required),
}
```

### PayoutBatch
```javascript
{
  merchant: ObjectId → User (required),
  batchId: String (required, unique),  // e.g., PAY-20260917-882
  totalAmount: Number (required),
  paymentChannel: 'BANK_TRANSFER' | 'BKASH' | 'NAGAD',
  accountDetails: { accountName, accountNumber, bankName, routingNumber },
  status: 'REQUESTED' | 'PROCESSING' | 'PAID' | 'REJECTED',
  processedBy: ObjectId → User,
  transactionRef: String,  // Bank EFT/bKash TRX ID
}
```

### Notification
```javascript
{
  recipient: ObjectId → User (required, indexed),
  title: String (required),
  message: String (required),
  type: 'ORDER_UPDATE' | 'PAYOUT_ALERT' | 'SYSTEM',
  order: ObjectId → Order,
  isRead: Boolean (default: false),
  metadata: Mixed,
}
// Compound index: { recipient, isRead, createdAt } for fast unread-count queries
```

## Environment Variables (`.env`)
```
PORT=5000
MONGODB_URI=mongodb+srv://...
JWT_SECRET=your_jwt_secret
NODE_ENV=development
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
CLIENT_URL=http://localhost:3000
REDIS_URL=redis://127.0.0.1:6379  # Optional - enables BullMQ + Socket.IO Redis adapter
```

## Running
```bash
npm install
npm run dev       # nodemon
npm start         # production
npm run seed      # seed test data
```

## Notes
- In development mode (`NODE_ENV=development`), emails are logged to console instead of sent
- OTP expiry, resend cooldown, and max attempts are enforced
- Refresh token rotation with reuse detection protects against token theft
- Socket.IO enables real-time location updates and order tracking rooms

## Feature Modules

### Rider Workflow Business Logic
- **Rejection Policy**: Riders can reject assigned orders before pickup; order resets to `CONFIRMED`, freeing the rider for reassignment
- **Account Deactivation**: Admins can deactivate riders (`isDeactivated: true`); deactivated riders are booted offline, blocked from accepting orders, and barred from logging in
- **Single Active Delivery Limit**: Riders can only hold 1 active delivery at a time (`activeOrderCount >= 1` blocks new assignments)
- **Availability Enforcement**: Offline/Unavailable riders cannot receive dispatch or accept orders
- **Admin Emergency Override**: Admins can assign orders to offline/unavailable riders in emergencies (bypasses online check for approved, non-deactivated riders with capacity)

### Parcel Pricing Engine (`pricingEngineService.js`)
- **Zone Resolution**: `resolveZone()` maps pickup/delivery districts to tariff zones (INSIDE_DHAKA, DHAKA_SUBURBAN, OUTSIDE_DHAKA, DISTRICT_TO_DISTRICT); checks if *either* endpoint is Dhaka before defaulting to inter-district
- **Volumetric Weight**: `(L × W × H) / 5000` compared against actual weight; minimum floor of 0.1 kg prevents zero-weight manifests
- **Lifecycle Financials**: DELIVERED collects COD + deducts delivery fee; RETURNED applies 50% RTO handling fee; PARTIAL_DELIVERY collects partial COD
- **Unclamped Ledger**: `netPayableToMerchant = collectedCash - totalDeliveryFee` can be negative, correctly tracking merchant debt on returns
- **Mongoose Hook Safety**: `pre('save')` only recalculates on pricing-relevant field mutations, preventing retroactive overwrite of closed orders

### Double-Entry Ledger (`ledgerService.js`)
- **ACID Transactions**: MongoDB sessions ensure wallet balance and ledger audit entries are never written independently
- **Settlement**: `settleOrderFinances()` posts COD_COLLECTION (credit) + DELIVERY_FEE/RETURN_HANDLING_FEE (debit) entries on final status transitions
- **Payout Disbursement**: `processPayoutDisbursement()` deducts from availableBalance, increments withdrawnBalance, and posts a PAYOUT_DISBURSEMENT audit entry
- **Reconciliation**: `reconcileWallet()` detects drift between the aggregated wallet and the sum of ledger entries, auto-correcting discrepancies
- **Guard Flag**: `financialsSettled` prevents duplicate ledger entries if a status is updated multiple times

### Notification System (`notificationService.js`, `notificationQueue.js`)
- **Real-Time Socket.IO**: Instant synchronous emissions to `order_{id}` and `user_{id}` rooms
- **Multi-Node Scaling**: `@socket.io/redis-adapter` broadcasts across server clusters via Redis Pub/Sub (graceful in-memory fallback)
- **Non-Blocking Queue**: BullMQ offloads email + DB persistence to a background worker so the API thread never blocks on SMTP latency
- **Auto-Retry**: Failed email sends retry 3× with 5s exponential backoff
- **In-App Inbox**: Every event persists a `Notification` record for historical notification bell view
- **Resilient**: If Redis is unavailable, `runInline()` persists the notification and sends email directly, so no notification is lost

### Input Validation Layer (`validators/`, `middleware/validate.middleware.js`)
- **Zod Schema Library**: Declarative runtime schema definitions for all request payloads
- **Per-Domain Schemas**: `auth.validator.js`, `order.validator.js`, `rider.validator.js`, `wallet.validator.js`
- **Generic Middleware**: `validate(schema)` is mounted on each route right after authentication
- **Request Flow**: `Incoming Request → Auth Middleware → Zod Validation → Controller → Business Logic`
- **Short-Circuiting**: Any validation failure returns immediate `400 Bad Request` with field-level errors; the controller never executes
- **Data Sanitization**: Controllers receive clean, pre-parsed, type-safe input (strings trimmed, numbers coerced, enums validated)
- **Standardized Error Format**:
  ```json
  {
    "success": false,
    "message": "Validation failed",
    "errors": [
      { "field": "packageDetails.weightKG", "message": "Weight must be greater than 0" }
    ]
  }
  ```
- **Validation Rules by Domain**:
  - **Auth**: Email format (RFC), password ≥ 6 chars, Bangladeshi phone regex (`01X...`), OTP 6-digit
  - **Order**: weight > 0 and ≤ 100 KG, paymentMethod enum (COD/PREPAID/CARD), required pickup/delivery details
  - **Rider**: vehicleType enum (BIKE/CAR/VAN/FOOT), GPS bounds (-180..180, -90..90), action/approvalStatus enums
  - **Wallet**: payout amount > 0, paymentChannel enum (BANK_TRANSFER/BKASH/NAGAD), accountNumber required

## Bug Fixes & Improvements

### Critical Fixes (Data Integrity & Security)

1. **`createOrder` returns 500 instead of 400 on validation errors** (`orderControllers.js`)
   - Mongoose `ValidationError` was being caught by the generic `catch` block and returned as 500
   - Added `isMongooseValidationError()` helper to detect and return proper 400 status with field-level error messages

2. **`financialsSettled` flag set BEFORE ledger settlement** (`orderService.js`, `orderControllers.js`)
   - The flag was marked `true` before `LedgerService.settleOrderFinances()` was called
   - If settlement threw an error, the order was marked settled but ledger was never updated — causing silent data loss
   - **Fix**: Reordered to run ledger settlement FIRST, then mark `financialsSettled = true`. If settlement fails, the order remains unmarked so retries can re-attempt safely

3. **`assignRiderToOrder` missing `Rider` model import** (`orderControllers.js`)
   - `Rider` was referenced but never imported, causing "Rider is not defined" 500 errors
   - **Fix**: Added `import Rider from '../models/Rider.js'`

4. **`assignRiderToOrder` prematurely set `activeOrderCount=1`** (`orderControllers.js`)
   - Capacity was consumed at assignment time, not at acceptance time
   - This blocked the rider from accepting the order because they already had "active" capacity
   - **Fix**: Assignment now only sets `isAvailable=false`; `activeOrderCount` is only incremented when the rider accepts the order

### High Priority Fixes (Authorization & Validation)

5. **`protect` middleware missing `return` before final 401** (`middleware/auth.js`)
   - When no Bearer token was present, the function fell through without returning, causing requests to hang
   - **Fix**: Added explicit `return res.status(401).json(...)` 

6. **`assignRiderToOrder` missing all business validation** (`orderControllers.js`)
   - No check for order state (could assign to already-picked-up orders)
   - No rider capacity check (could double-assign)
   - No deactivation/availability checks
   - No previous rider release logic
   - **Fix**: Added full validation — order state check, rider profile existence, deactivation check, capacity check, availability check, and previous rider release

7. **`updateOrderStatus` missing validation & statusHistory fields** (`orderControllers.js`)
   - Missing `updatedAt` and `userRole` fields in statusHistory entries
   - No error handling for validation errors
   - **Fix**: Added proper statusHistory fields and error handling

8. **`getOrders` missing pagination** (`orderControllers.js`)
   - Returned all orders without limit, causing memory issues with large datasets
   - **Fix**: Added page/limit/skip with proper pagination metadata in response

9. **`updateLocation` returns 404 for missing coords (should be 400)** (`RiderController.js`)
   - Missing longitude/latitude returned 404 (Not Found) instead of 400 (Bad Request)
   - **Fix**: Changed to 400, added numeric validation

10. **Auth controllers missing input validation** (`AuthController.js`)
    - `register`: No email format validation, no password length check, no role validation
    - `login`: No required field validation
    - `forgotPassword`: Returned 403 instead of 400 for missing email; returned 403 instead of 404 for nonexistent user
    - `resetPassword`: No OTP format validation (must be 6-digit)
    - **Fix**: Added comprehensive validation with proper status codes

11. **OTP controllers missing validation** (`otpController.js`)
    - `sendOTP`: Returned 403 instead of 400 for missing email
    - `verifyOTP`: No OTP format validation
    - **Fix**: Added email/OTP format validation with proper 400 status codes

12. **Rider controllers missing validation** (`RiderController.js`)
    - `applyForRider`: No input validation, no error handling for duplicate keys
    - `processRiderApplications`: No action validation
    - `toggleOnlineStatus`: No boolean type check
    - `reviewApplication`: No approvalStatus validation
    - `deactivateRider`: No boolean type check
    - **Fix**: Added comprehensive validation and proper error handling

13. **Wallet disbursement missing validation** (`walletController.js`)
    - No input validation in controller (relies solely on middleware)
    - **Fix**: Added validation with proper error handling

14. **Manual validation checks removed from controllers**
    - All `if/else` validation in controllers was replaced by Zod schema validation at the route boundary
    - Controllers now receive clean, pre-sanitized input with guaranteed type safety
    - **Files affected**: `AuthController.js`, `otpController.js`, `RiderController.js`

### Medium Priority Fixes (Robustness)

15. **Global error handler missing** (`index.js`)
    - No Express error-handling middleware; unhandled errors could crash the process
    - **Fix**: Added global error handler that properly formats Mongoose validation errors, duplicate key errors, and JSON parse errors. Also added `uncaughtException` and `unhandledRejection` handlers.

16. **`orderStateEngine` allowed admin to bypass all state validation** (`orderStateEngine.js`)
    - Admin role returned `{ valid: true }` immediately, bypassing terminal state checks
    - This allowed admins to modify already-delivered/cancelled/returned orders
    - **Fix**: Admin now respects terminal state checks; can only transition to valid non-terminal states

17. **Route ordering** (`orderRoute.js`, `notificationRoutes.js`)
    - Confirmed correct ordering — `/:id/status`, `/:id/reject`, `/:id/failed`, `/:id/reassign`, `/:id/assign` all come before generic `/:id` route

### Test Results
- **Before fixes**: 22/23 smoke tests passed (1 validation error returned 500)
- **After fixes**: 23/23 smoke tests passed
- All validation errors now correctly return 400 status
- All authorization checks properly enforced
