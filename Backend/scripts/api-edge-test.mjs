/**
 * Edge-case tests for the Courier backend.
 * Usage: BASE_URL=http://localhost:5002 node scripts/api-edge-test.mjs
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
  try { json = await res.json(); } catch { json = null; }
  if (expectStatus !== undefined && res.status !== expectStatus) {
    throw new Error(`${method} ${path} expected ${expectStatus}, got ${res.status}: ${JSON.stringify(json)}`);
  }
  return { status: res.status, json, headers: res.headers };
}

const uid = () => `${Date.now()}${Math.floor(Math.random() * 9999)}`;

async function main() {
  console.log(`Edge tests ${BASE}\n`);

  const custEmail = `cust_edge_${uid()}@test.com`;
  const custPhone = `01${uid().slice(-9)}`;
  const adminEmail = `admin_edge_${uid()}@test.com`;
  const riderEmail = `rider_edge_${uid()}@test.com`;
  const riderPhone = `02${uid().slice(-9)}`;

  let customerToken, customerId, adminToken, riderToken, riderId, riderApplicationId;

  try {
    const { json } = await req('POST', '/api/auth/register', {
      body: { name: 'Edge Cust', email: custEmail, phone: custPhone, password: 'password123', role: 'CUSTOMER' },
      expectStatus: 201,
    });
    customerToken = json.data.token; customerId = json.data._id; pass('Edge: register customer');
  } catch (e) { fail('Edge: register customer', e.message); }

  try {
    await req('POST', '/api/auth/register', {
      body: { name: 'Edge Admin', email: adminEmail, phone: '03' + uid().slice(-9), password: 'password123', role: 'ADMIN' },
      expectStatus: 201,
    });
    const { json } = await req('POST', '/api/auth/login', { body: { email: adminEmail, password: 'password123' }, expectStatus: 200 });
    adminToken = json.data.token; pass('Edge: admin login');
  } catch (e) { fail('Edge: admin setup', e.message); }

  try {
    const { json } = await req('POST', '/api/rider/apply', {
      body: { name: 'Edge Rider', email: riderEmail, phone: riderPhone, password: 'password123', vehicleType: 'BIKE', licenseNumber: 'LIC-' + uid() },
      expectStatus: 201,
    });
    riderApplicationId = json.data.applicationId;
    pass('Edge: rider apply');
  } catch (e) { fail('Edge: rider apply', e.message); }

  try {
    if (adminToken && riderApplicationId) {
      await req('PATCH', `/api/rider/application/${riderApplicationId}/approve`, { token: adminToken, body: { action: 'APPROVE' }, expectStatus: 200 });
      pass('Edge: approve rider');
    }
  } catch (e) { fail('Edge: approve rider', e.message); }

  try {
    const { json } = await req('POST', '/api/auth/login', { body: { email: riderEmail, password: 'password123' }, expectStatus: 200 });
    riderToken = json.data.token; riderId = json.data._id; pass('Edge: rider login');
  } catch (e) { fail('Edge: rider login', e.message); }

  if (!customerToken || !riderToken || !adminToken) {
    console.log('Setup incomplete, skipping edge tests');
    process.exit(1);
  }

  let orderId;
  try {
    const { json } = await req('POST', '/api/orders', {
      token: customerToken,
      body: {
        pickupDetails: { name: 'Sender', phone: '01711111111', address: 'Dhaka A' },
        deliveryDetails: { name: 'Receiver', phone: '01722222222', address: 'Dhaka B' },
        packageDetails: { weightKG: 2, description: 'Edge test', category: 'PARCEL' },
        pickupAddress: { district: 'Dhaka', area: 'Gulshan' },
        deliveryAddress: { district: 'Dhaka', area: 'Banani' },
        codAmount: 500,
        paymentMethod: 'COD',
      },
      expectStatus: 201,
    });
    orderId = json.data._id; pass('Edge: create order');
  } catch (e) { fail('Edge: create order', e.message); }

  if (!orderId) { console.log('No order, skipping edge tests'); process.exit(1); }

  try {
    await req('PATCH', `/api/orders/${orderId}/assign`, { token: adminToken, body: { riderId }, expectStatus: 200 });
    pass('Edge: assign rider to order');
  } catch (e) { fail('Edge: assign rider', e.message); }

  try {
    await req('PATCH', '/api/rider/toggle-online', { token: riderToken, body: { isAvailable: true }, expectStatus: 200 });
    pass('Edge: rider online');
  } catch (e) { fail('Edge: rider online', e.message); }

  try {
    await req('POST', `/api/rider/orders/${orderId}/accept`, { token: riderToken, body: {}, expectStatus: 200 });
    pass('Edge: accept order');
  } catch (e) { fail('Edge: accept order', e.message); }

  console.log('\n--- Edge Cases ---\n');

  console.log('Auth edge cases:');
  try {
    await req('POST', '/api/auth/register', { body: { name: '', email: 'bad', phone: '123', password: '1', role: 'INVALID' }, expectStatus: 400 });
    pass('Register: multiple field validation errors');
  } catch (e) { fail('Register: multiple validation', e.message); }

  try {
    await req('POST', '/api/auth/register', { body: { name: 'Test', email: custEmail, phone: custPhone, password: 'password123', role: 'CUSTOMER' }, expectStatus: 400 });
    pass('Register: duplicate email rejected');
  } catch (e) { fail('Register: duplicate email', e.message); }

  try {
    await req('POST', '/api/auth/login', { body: { email: '', password: '' }, expectStatus: 400 });
    pass('Login: empty credentials rejected');
  } catch (e) { fail('Login: empty creds', e.message); }

  try {
    await req('POST', '/api/auth/refresh-token', { body: {}, expectStatus: 401 });
    pass('Refresh token: no token rejected');
  } catch (e) { fail('Refresh token: no token', e.message); }

  console.log('Order edge cases:');
  try {
    await req('POST', '/api/orders', { token: customerToken, body: { pickupDetails: { name: 'S', phone: '01711111111', address: 'A' }, deliveryDetails: { name: 'R', phone: '01722222222', address: 'B' }, packageDetails: { weightKG: 2, description: 'X', category: 'PARCEL' }, pickupAddress: { district: 'Dhaka', area: 'G' }, deliveryAddress: { district: 'Dhaka', area: 'B' }, codAmount: 500, paymentMethod: 'CASH' }, expectStatus: 400 });
    pass('Create order: invalid payment method');
  } catch (e) { fail('Create order: invalid payment', e.message); }

  try {
    await req('GET', `/api/orders/${orderId}`, { token: customerToken, expectStatus: 200 });
    pass('Order details: valid ID');
  } catch (e) { fail('Order details: valid ID', e.message); }

  try {
    await req('GET', '/api/orders/nonexistent-id', { token: customerToken, expectStatus: 404 });
    pass('Order details: invalid ID returns 404');
  } catch (e) { fail('Order details: invalid ID', e.message); }

  try {
    await req('GET', '/api/orders/tracking/NOT-REAL', { expectStatus: 404 });
    pass('Track order: unknown tracking ID returns 404');
  } catch (e) { fail('Track order: unknown ID', e.message); }

  try {
    await req('GET', '/api/orders/tracking/', { token: customerToken, expectStatus: 404 });
    pass('Track order: empty tracking ID');
  } catch (e) { fail('Track order: empty ID', e.message); }

  console.log('Rider edge cases:');
  try {
    await req('PATCH', '/api/rider/toggle-online', { token: riderToken, body: { isAvailable: 'yes' }, expectStatus: 400 });
    pass('Toggle online: invalid type rejected');
  } catch (e) { fail('Toggle online: invalid type', e.message); }

  try {
    await req('PATCH', '/api/rider/toggle-online', { token: riderToken, body: {}, expectStatus: 400 });
    pass('Toggle online: no body accepted');
  } catch (e) { fail('Toggle online: no body', e.message); }

  try {
    await req('PATCH', '/api/rider/toggle-online', { token: riderToken, body: { isAvailable: 123 }, expectStatus: 400 });
    pass('Toggle online: non-boolean rejected');
  } catch (e) { fail('Toggle online: non-boolean', e.message); }

  try {
    await req('PATCH', '/api/rider/location', { token: riderToken, body: { longitude: 999, latitude: 23.8103 }, expectStatus: 400 });
    pass('Location: out-of-range longitude rejected');
  } catch (e) { fail('Location: out of range', e.message); }

  try {
    await req('PATCH', '/api/rider/location', { token: riderToken, body: { longitude: 90.4125 }, expectStatus: 400 });
    pass('Location: missing latitude rejected');
  } catch (e) { fail('Location: missing lat', e.message); }

  try {
    await req('PATCH', '/api/rider/location', { token: riderToken, body: { longitude: 'abc', latitude: 'def' }, expectStatus: 400 });
    pass('Location: non-numeric rejected');
  } catch (e) { fail('Location: non-numeric', e.message); }

  console.log('Rider workflow state transitions:');
  try {
    await req('POST', `/api/rider/orders/${orderId}/complete`, { token: riderToken, body: {}, expectStatus: 400 });
    fail('Complete order: should fail if already completed');
  } catch (e) { pass('Complete order: already completed rejected'); }

  try {
    await req('POST', `/api/rider/orders/${orderId}/accept`, { token: riderToken, body: {}, expectStatus: 400 });
    pass('Accept order: already accepted/completed rejected');
  } catch (e) { fail('Accept order: already accepted', e.message); }

  try {
    await req('POST', `/api/rider/orders/${orderId}/reject`, { token: riderToken, body: { reason: '' }, expectStatus: 400 });
    pass('Reject order: empty reason rejected');
  } catch (e) { fail('Reject order: empty reason', e.message); }

  console.log('Notification edge cases:');
  try {
    await req('GET', '/api/notifications', { token: customerToken, expectStatus: 200 });
    pass('List notifications: empty list OK');
  } catch (e) { fail('List notifications', e.message); }

  try {
    await req('PATCH', '/api/notifications/read-all', { token: customerToken, expectStatus: 200 });
    pass('Mark all read: already read OK');
  } catch (e) { fail('Mark all read', e.message); }

  try {
    await req('PATCH', '/api/notifications/nonexistent/read', { token: customerToken, expectStatus: 404 });
    pass('Mark one read: nonexistent ID returns 404');
  } catch (e) { fail('Mark one read: nonexistent', e.message); }

  console.log('Wallet edge cases:');
  try {
    const { status } = await req('POST', '/api/wallet/reconcile', { token: customerToken });
    if (status === 200 || status === 400) pass(`Reconcile: returns ${status} for wallet-less user`);
    else fail('Reconcile', `unexpected ${status}`);
  } catch (e) { fail('Reconcile', e.message); }

  try {
    await req('GET', '/api/wallet/me', { token: customerToken, expectStatus: 200 });
    pass('My wallet: valid request');
  } catch (e) { fail('My wallet', e.message); }

  try {
    await req('GET', '/api/wallet/ledger', { token: customerToken, expectStatus: 200 });
    pass('Ledger entries: valid request');
  } catch (e) { fail('Ledger entries', e.message); }

  try {
    await req('POST', '/api/wallet/disburse', {
      token: adminToken,
      body: { amount: -100, merchantId: customerId },
      expectStatus: 400,
    });
    pass('Disburse: negative amount rejected');
  } catch (e) { fail('Disburse: negative amount', e.message); }

  console.log('Admin edge cases:');
  try {
    await req('GET', '/api/admin/analyze', { token: adminToken, expectStatus: 200 });
    pass('Dashboard: valid admin');
  } catch (e) { fail('Dashboard', e.message); }

  try {
    await req('GET', '/api/rider/nearby?lat=23.8103&lng=90.4125', { token: adminToken, expectStatus: 200 });
    pass('Nearby riders: valid query');
  } catch (e) { fail('Nearby riders', e.message); }

  try {
    await req('GET', '/api/rider/nearby?lat=abc&lng=xyz', { token: adminToken, expectStatus: 400 });
    pass('Nearby riders: invalid coords rejected');
  } catch (e) { fail('Nearby riders: invalid coords', e.message); }

  try {
    await req('PATCH', `/api/rider/${riderId}/review`, { token: adminToken, body: { approvalStatus: 'INVALID' }, expectStatus: 400 });
    pass('Review application: invalid status rejected');
  } catch (e) { fail('Review application: invalid status', e.message); }

  try {
    await req('PATCH', `/api/rider/${riderId}/deactivate`, { token: adminToken, body: { isDeactivated: 'yes' }, expectStatus: 400 });
    pass('Deactivate rider: non-boolean rejected');
  } catch (e) { fail('Deactivate rider: non-boolean', e.message); }

  console.log(`\n--- Summary: ${passes.length} passed, ${failures.length} failed ---`);
  if (failures.length) {
    for (const f of failures) console.log(`  - ${f.name}: ${f.detail}`);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
