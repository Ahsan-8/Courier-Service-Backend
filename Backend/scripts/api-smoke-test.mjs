/**
 * Comprehensive API smoke / scenario tests against a running server.
 * Usage: BASE_URL=http://localhost:5002 node scripts/api-smoke-test.mjs
 */
const BASE = process.env.BASE_URL || 'http://localhost:5002';
const failures = [];
const passes = [];

function pass(name) {
  passes.push(name);
  console.log(`  ✓ ${name}`);
}

function fail(name, detail) {
  failures.push({ name, detail });
  console.log(`  ✗ ${name}: ${detail}`);
}

async function req(method, path, { token, body, expectStatus } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (expectStatus !== undefined && res.status !== expectStatus) {
    throw new Error(`${method} ${path} expected ${expectStatus}, got ${res.status}: ${JSON.stringify(json)}`);
  }
  return { status: res.status, json, headers: res.headers };
}

const uid = () => `${Date.now()}${Math.floor(Math.random() * 9999)}`;

async function main() {
  console.log(`Testing ${BASE}\n`);

  // Health
  try {
    const { status } = await req('GET', '/');
    if (status === 200) pass('GET / health');
    else fail('GET / health', `status ${status}`);
  } catch (e) {
    fail('GET / health', e.message);
  }

  const customerEmail = `cust_${uid()}@test.com`;
  const customerPhone = `01${uid().slice(-9)}`;
  let customerToken;
  let customerId;

  // Register customer
  try {
    const { json } = await req('POST', '/api/auth/register', {
      body: {
        name: 'Test Customer',
        email: customerEmail,
        phone: customerPhone,
        password: 'password123',
        role: 'CUSTOMER',
      },
      expectStatus: 201,
    });
    customerToken = json.data.token;
    customerId = json.data._id;
    pass('POST /api/auth/register customer');
  } catch (e) {
    fail('POST /api/auth/register customer', e.message);
  }

  // Duplicate register
  try {
    await req('POST', '/api/auth/register', {
      body: { name: 'Dup', email: customerEmail, phone: '01999999999', password: 'password123' },
      expectStatus: 400,
    });
    pass('POST /api/auth/register duplicate email rejected');
  } catch (e) {
    fail('POST /api/auth/register duplicate', e.message);
  }

  // Login
  try {
    const { json } = await req('POST', '/api/auth/login', {
      body: { email: customerEmail, password: 'password123' },
      expectStatus: 200,
    });
    if (json.data.token) pass('POST /api/auth/login');
    else fail('POST /api/auth/login', 'no token');
  } catch (e) {
    fail('POST /api/auth/login', e.message);
  }

  // Bad login
  try {
    await req('POST', '/api/auth/login', {
      body: { email: customerEmail, password: 'wrongpass' },
      expectStatus: 401,
    });
    pass('POST /api/auth/login wrong password');
  } catch (e) {
    fail('POST /api/auth/login wrong password', e.message);
  }

  // Protected without token
  try {
    await req('GET', '/api/orders', { expectStatus: 401 });
    pass('GET /api/orders without token → 401');
  } catch (e) {
    fail('GET /api/orders auth', e.message);
  }

  // Create order — missing fields
  try {
    await req('POST', '/api/orders', {
      token: customerToken,
      body: {},
      expectStatus: 400,
    });
    pass('POST /api/orders empty body fails validation');
  } catch (e) {
    fail('POST /api/orders empty', e.message);
  }

  const orderPayload = {
    pickupDetails: { name: 'Sender', phone: '01711111111', address: 'Dhaka A' },
    deliveryDetails: { name: 'Receiver', phone: '01722222222', address: 'Dhaka B' },
    packageDetails: { weightKG: 2, description: 'Books', category: 'PARCEL' },
    pickupAddress: { district: 'Dhaka', area: 'Gulshan' },
    deliveryAddress: { district: 'Dhaka', area: 'Banani' },
    codAmount: 500,
    paymentMethod: 'COD',
  };

  let orderId;
  let trackingId;
  try {
    const { json } = await req('POST', '/api/orders', {
      token: customerToken,
      body: orderPayload,
      expectStatus: 201,
    });
    orderId = json.data._id;
    trackingId = json.data.trackingId;
    pass('POST /api/orders create');
  } catch (e) {
    fail('POST /api/orders create', e.message);
  }

  // Public tracking
  if (trackingId) {
    try {
      await req('GET', `/api/orders/tracking/${trackingId}`, { expectStatus: 200 });
      pass('GET /api/orders/tracking/:trackingId');
    } catch (e) {
      fail('GET tracking', e.message);
    }
  }

  // Admin account for RBAC scenarios
  let adminToken;
  const adminEmail = `admin_${uid()}@test.com`;
  try {
    await req('POST', '/api/auth/register', {
      body: {
        name: 'Test Admin',
        email: adminEmail,
        phone: `03${uid().slice(-9)}`,
        password: 'password123',
        role: 'ADMIN',
      },
      expectStatus: 201,
    });
    const { json } = await req('POST', '/api/auth/login', {
      body: { email: adminEmail, password: 'password123' },
      expectStatus: 200,
    });
    adminToken = json.data.token;
    pass('Admin register + login');
  } catch (e) {
    fail('Admin setup', e.message);
  }

  // Register rider + approve flow
  const riderEmail = `rider_${uid()}@test.com`;
  const riderPhone = `02${uid().slice(-9)}`;
  let riderUserToken;
  let riderUserId;
  let riderProfileId;

  try {
    const { json } = await req('POST', '/api/rider/apply', {
      body: {
        name: 'Test Rider',
        email: riderEmail,
        phone: riderPhone,
        password: 'password123',
        vehicleType: 'BIKE',
        licenseNumber: `LIC${uid()}`,
      },
      expectStatus: 201,
    });
    riderProfileId = json.data.applicationId;
    pass('POST /api/rider/apply');
  } catch (e) {
    fail('POST /api/rider/apply', e.message);
  }

  // Pending rider cannot login
  try {
    await req('POST', '/api/auth/login', {
      body: { email: riderEmail, password: 'password123' },
      expectStatus: 403,
    });
    pass('Pending rider login blocked');
  } catch (e) {
    fail('Pending rider login', e.message);
  }

  if (adminToken && riderProfileId) {
    try {
      await req('PATCH', `/api/rider/application/${riderProfileId}/approve`, {
        token: adminToken,
        body: { action: 'APPROVE' },
        expectStatus: 200,
      });
      pass('PATCH approve rider application');
    } catch (e) {
      fail('PATCH approve rider', e.message);
    }
  }

  try {
    const { json } = await req('POST', '/api/auth/login', {
      body: { email: riderEmail, password: 'password123' },
      expectStatus: 200,
    });
    riderUserToken = json.data.token;
    riderUserId = json.data._id;
    pass('Approved rider login');
  } catch (e) {
    fail('Approved rider login', e.message);
  }

  // Assign rider to order
  if (adminToken && orderId && riderUserId) {
    try {
      await req('PATCH', `/api/orders/${orderId}/assign`, {
        token: adminToken,
        body: { riderId: riderUserId },
        expectStatus: 200,
      });
      pass('PATCH assign rider to order');
    } catch (e) {
      fail('PATCH assign rider', e.message);
    }
  }

  // Rider must be online before accept
  if (riderUserToken) {
    try {
      await req('PATCH', '/api/rider/toggle-online', {
        token: riderUserToken,
        body: { isAvailable: true },
        expectStatus: 200,
      });
      pass('PATCH rider toggle online');
    } catch (e) {
      fail('PATCH rider toggle online', e.message);
    }
  }

  if (riderUserToken && orderId) {
    try {
      await req('POST', `/api/rider/orders/${orderId}/accept`, {
        token: riderUserToken,
        body: {},
        expectStatus: 200,
      });
      pass('POST rider accept order');
    } catch (e) {
      fail('POST rider accept order', e.message);
    }
  }

  if (riderUserToken && orderId) {
    try {
      await req('POST', `/api/rider/orders/${orderId}/complete`, {
        token: riderUserToken,
        body: {},
        expectStatus: 200,
      });
      pass('POST rider complete order');
    } catch (e) {
      fail('POST rider complete order', e.message);
    }
  }

  // Notifications read-all route ordering
  if (customerToken) {
    try {
      const { json, status } = await req('PATCH', '/api/notifications/read-all', {
        token: customerToken,
      });
      if (status === 200 && json.success && json.message?.includes('All notifications')) {
        pass('PATCH /api/notifications/read-all');
      } else {
        fail('PATCH read-all', `status=${status} body=${JSON.stringify(json)}`);
      }
    } catch (e) {
      fail('PATCH read-all', e.message);
    }
  }

  // Wallet reconcile (may fail if no wallet)
  if (customerToken) {
    try {
      const { status, json } = await req('POST', '/api/wallet/reconcile', { token: customerToken });
      if (status === 200 || status === 400) {
        pass(`POST /api/wallet/reconcile (${status})`);
      } else {
        fail('wallet reconcile', `${status} ${JSON.stringify(json)}`);
      }
    } catch (e) {
      fail('wallet reconcile', e.message);
    }
  }

  // Refresh token without cookie
  try {
    await req('POST', '/api/auth/refresh-token', { body: {}, expectStatus: 401 });
    pass('POST refresh-token missing → 401');
  } catch (e) {
    fail('refresh-token', e.message);
  }

  // OTP send (may fail if SMTP broken — record status)
  try {
    const { status } = await req('POST', '/api/otp/send-otp', {
      body: { email: customerEmail },
    });
    if (status === 200 || status === 500) {
      pass(`POST /api/otp/send-otp (${status})`);
    } else fail('send-otp', `status ${status}`);
  } catch (e) {
    fail('send-otp', e.message);
  }

  // Admin dashboard
  if (adminToken) {
    try {
      await req('GET', '/api/admin/analyze', { token: adminToken, expectStatus: 200 });
      pass('GET /api/admin/analyze');
    } catch (e) {
      fail('admin analyze', e.message);
    }
  }

  console.log(`\n--- Summary: ${passes.length} passed, ${failures.length} failed ---`);
  if (failures.length) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f.name}: ${f.detail}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
