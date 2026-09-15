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

describe('Expense Splitting', () => {
  test('Case 1: equal split among 3 participants distributes the remainder cent exactly', async () => {
    const A = userId();
    const B = userId();
    const C = userId();

    const res = await request(app)
      .post('/api/expenses')
      .set('x-dev-user-id', A)
      .send({
        description: 'Groceries',
        totalAmountCents: 1000,
        splitType: 'EQUAL',
        participants: [
          { userId: A, paidAmountCents: 1000 },
          { userId: B, paidAmountCents: 0 },
          { userId: C, paidAmountCents: 0 },
        ],
      });

    expect(res.status).toBe(201);
    const shares = res.body.participants.map((p) => p.shareAmountCents);
    expect(shares).toEqual([334, 333, 333]);
    expect(shares.reduce((sum, s) => sum + s, 0)).toBe(1000);
  });

  test('Case 2: custom split whose share amounts sum exactly to the total succeeds', async () => {
    const A = userId();
    const B = userId();

    const res = await request(app)
      .post('/api/expenses')
      .set('x-dev-user-id', A)
      .send({
        description: 'Rent',
        totalAmountCents: 10000,
        splitType: 'CUSTOM',
        participants: [
          { userId: A, shareAmountCents: 6000, paidAmountCents: 10000 },
          { userId: B, shareAmountCents: 4000, paidAmountCents: 0 },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.participants.map((p) => p.shareAmountCents)).toEqual([6000, 4000]);
  });

  test("Case 3: custom split whose share amounts don't sum to the total is rejected with 400", async () => {
    const A = userId();
    const B = userId();

    const res = await request(app)
      .post('/api/expenses')
      .set('x-dev-user-id', A)
      .send({
        description: 'Utilities',
        totalAmountCents: 10000,
        splitType: 'CUSTOM',
        participants: [
          { userId: A, shareAmountCents: 6000, paidAmountCents: 10000 },
          { userId: B, shareAmountCents: 3000, paidAmountCents: 0 },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/sum of shareAmountCents/);
  });

  test('Case 4: net balance nets correctly for two users across multiple shared expenses', async () => {
    const A = userId();
    const B = userId();

    // Expense 1: A owes B $30 (3000 cents) -- B fronted the money for A's share.
    await request(app)
      .post('/api/expenses')
      .set('x-dev-user-id', A)
      .send({
        description: 'Expense 1',
        totalAmountCents: 3000,
        splitType: 'CUSTOM',
        participants: [
          { userId: A, shareAmountCents: 3000, paidAmountCents: 0 },
          { userId: B, shareAmountCents: 0, paidAmountCents: 3000 },
        ],
      });

    // Expense 2: B owes A $10 (1000 cents) -- A fronted the money for B's share.
    await request(app)
      .post('/api/expenses')
      .set('x-dev-user-id', A)
      .send({
        description: 'Expense 2',
        totalAmountCents: 1000,
        splitType: 'CUSTOM',
        participants: [
          { userId: A, shareAmountCents: 0, paidAmountCents: 1000 },
          { userId: B, shareAmountCents: 1000, paidAmountCents: 0 },
        ],
      });

    // Net: A owes B $30 - $10 = $20 (2000 cents).
    const balancesA = await request(app).get('/api/expenses/balances').set('x-dev-user-id', A);
    expect(balancesA.status).toBe(200);
    expect(balancesA.body).toEqual([{ counterpartUserId: B, amountCents: 2000, direction: 'OWES' }]);

    const balancesB = await request(app).get('/api/expenses/balances').set('x-dev-user-id', B);
    expect(balancesB.status).toBe(200);
    expect(balancesB.body).toEqual([{ counterpartUserId: A, amountCents: 2000, direction: 'OWED_BY' }]);
  });

  test('Case 5: an expense with only 1 participant is rejected with 400', async () => {
    const A = userId();

    const res = await request(app)
      .post('/api/expenses')
      .set('x-dev-user-id', A)
      .send({
        description: 'Solo',
        totalAmountCents: 500,
        splitType: 'EQUAL',
        participants: [{ userId: A, paidAmountCents: 500 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at least 2 participants/);
  });

  test('Case 6: requests without an auth header are rejected with 401', async () => {
    const createRes = await request(app).post('/api/expenses').send({});
    expect(createRes.status).toBe(401);

    const balancesRes = await request(app).get('/api/expenses/balances');
    expect(balancesRes.status).toBe(401);
  });
});
