const request = require('supertest');
const { mongoose } = require('../src/config/db');
const { connect, clearDatabase, closeDatabase } = require('./setup');

let app;

beforeAll(async () => {
  await connect();
  app = require('../src/app');
});

afterEach(async () => {
  await clearDatabase();
});

afterAll(async () => {
  await closeDatabase();
});

function userId() {
  return new mongoose.Types.ObjectId().toString();
}

async function createTransaction(user) {
  const res = await request(app)
    .post('/api/transactions')
    .set('x-dev-user-id', user)
    .send({ type: 'DEBIT', amountCents: 500, currency: 'USD', description: 'Coffee' });
  return res.body;
}

describe('Transaction multi-tenant scoping (remediated)', () => {
  test('a user cannot see another user\'s transactions via GET /api/transactions', async () => {
    const A = userId();
    const B = userId();

    await createTransaction(A);

    const listB = await request(app).get('/api/transactions').set('x-dev-user-id', B);
    expect(listB.status).toBe(200);
    expect(listB.body).toEqual([]);

    const listA = await request(app).get('/api/transactions').set('x-dev-user-id', A);
    expect(listA.body).toHaveLength(1);
  });

  test('a user cannot delete another user\'s transaction by id (no IDOR)', async () => {
    const A = userId();
    const B = userId();

    const transaction = await createTransaction(A);

    const deleteAttempt = await request(app)
      .delete(`/api/transactions/${transaction._id}`)
      .set('x-dev-user-id', B);
    expect(deleteAttempt.status).toBe(400);

    const listA = await request(app).get('/api/transactions').set('x-dev-user-id', A);
    expect(listA.body).toHaveLength(1);
  });

  test('delete-all is scoped to the caller and never touches another tenant\'s data', async () => {
    const A = userId();
    const B = userId();

    await createTransaction(A);
    await createTransaction(B);
    await createTransaction(B);

    const deleteAllB = await request(app).delete('/api/transactions').set('x-dev-user-id', B);
    expect(deleteAllB.status).toBe(200);
    expect(deleteAllB.body.deletedCount).toBe(2);

    const listA = await request(app).get('/api/transactions').set('x-dev-user-id', A);
    expect(listA.body).toHaveLength(1);

    const listB = await request(app).get('/api/transactions').set('x-dev-user-id', B);
    expect(listB.body).toHaveLength(0);
  });

  test('requests without an auth header are rejected with 401', async () => {
    const res = await request(app).get('/api/transactions');
    expect(res.status).toBe(401);
  });
});
