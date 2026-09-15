const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { mongoose } = require('../config/db');
const { SharedExpense } = require('./shared-expense.model');

let mongod;
let app;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  app = require('../app');
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await SharedExpense.deleteMany({});
});

const A = new mongoose.Types.ObjectId().toString();
const B = new mongoose.Types.ObjectId().toString();
const C = new mongoose.Types.ObjectId().toString();
const D = new mongoose.Types.ObjectId().toString();

describe('POST /api/expenses', () => {
  it('rejects requests with no auth header', async () => {
    const res = await request(app).post('/api/expenses').send({});
    expect(res.status).toBe(401);
  });

  it('creates an EQUAL split with correct computed shares', async () => {
    const res = await request(app)
      .post('/api/expenses')
      .set('x-dev-user-id', A)
      .send({
        description: 'Dinner',
        totalAmountCents: 1000,
        splitType: 'EQUAL',
        participants: [
          { userId: A, paidAmountCents: 1000 },
          { userId: B, paidAmountCents: 0 },
          { userId: C, paidAmountCents: 0 },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.participants.map((p) => p.shareAmountCents)).toEqual([334, 333, 333]);
  });

  it('rejects a single-participant expense with 400', async () => {
    const res = await request(app)
      .post('/api/expenses')
      .set('x-dev-user-id', A)
      .send({
        totalAmountCents: 100,
        splitType: 'EQUAL',
        participants: [{ userId: A, paidAmountCents: 100 }],
      });

    expect(res.status).toBe(400);
  });

  it('rejects mismatched shareAmountCents/paidAmountCents sums with 400', async () => {
    const res = await request(app)
      .post('/api/expenses')
      .set('x-dev-user-id', A)
      .send({
        totalAmountCents: 100,
        splitType: 'CUSTOM',
        participants: [
          { userId: A, shareAmountCents: 40, paidAmountCents: 100 },
          { userId: B, shareAmountCents: 40, paidAmountCents: 0 },
        ],
      });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/expenses/balances', () => {
  it('rejects requests with no auth header', async () => {
    const res = await request(app).get('/api/expenses/balances');
    expect(res.status).toBe(401);
  });

  it('isolates balances by membership and matches the worked example', async () => {
    await request(app)
      .post('/api/expenses')
      .set('x-dev-user-id', A)
      .send({
        totalAmountCents: 90,
        splitType: 'EQUAL',
        participants: [
          { userId: A, paidAmountCents: 90 },
          { userId: B, paidAmountCents: 0 },
          { userId: C, paidAmountCents: 0 },
        ],
      });

    await request(app)
      .post('/api/expenses')
      .set('x-dev-user-id', A)
      .send({
        totalAmountCents: 50,
        splitType: 'EQUAL',
        participants: [
          { userId: A, paidAmountCents: 0 },
          { userId: B, paidAmountCents: 50 },
        ],
      });

    const balancesA = await request(app).get('/api/expenses/balances').set('x-dev-user-id', A);
    expect(balancesA.status).toBe(200);
    expect(balancesA.body).toEqual(
      expect.arrayContaining([
        { counterpartUserId: B, amountCents: 5, direction: 'OWED_BY' },
        { counterpartUserId: C, amountCents: 30, direction: 'OWED_BY' },
      ]),
    );

    const balancesD = await request(app).get('/api/expenses/balances').set('x-dev-user-id', D);
    expect(balancesD.status).toBe(200);
    expect(balancesD.body).toEqual([]);
  });
});
