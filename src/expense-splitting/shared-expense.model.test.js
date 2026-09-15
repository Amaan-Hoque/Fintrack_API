const { MongoMemoryServer } = require('mongodb-memory-server');
const { mongoose } = require('../config/db');
const { SharedExpense } = require('./shared-expense.model');

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await SharedExpense.deleteMany({});
});

function validDoc(overrides = {}) {
  return {
    creator: new mongoose.Types.ObjectId(),
    description: 'Dinner',
    totalAmountCents: 1000,
    splitType: 'EQUAL',
    participants: [
      { userId: new mongoose.Types.ObjectId(), shareAmountCents: 500, paidAmountCents: 1000 },
      { userId: new mongoose.Types.ObjectId(), shareAmountCents: 500, paidAmountCents: 0 },
    ],
    ...overrides,
  };
}

describe('SharedExpense model', () => {
  it('rejects fewer than 2 participants', async () => {
    const doc = new SharedExpense(validDoc({
      participants: [{ userId: new mongoose.Types.ObjectId(), shareAmountCents: 1000, paidAmountCents: 1000 }],
    }));

    await expect(doc.validate()).rejects.toThrow(/at least 2 entries/);
  });

  it('rejects a non-safe-integer amount', async () => {
    const doc = new SharedExpense(validDoc({ totalAmountCents: 10.5 }));

    await expect(doc.validate()).rejects.toThrow();
  });

  it('rejects a negative amount', async () => {
    const doc = new SharedExpense(validDoc({ totalAmountCents: -100 }));

    await expect(doc.validate()).rejects.toThrow();
  });

  it('accepts a valid document', async () => {
    const doc = new SharedExpense(validDoc());

    await expect(doc.validate()).resolves.toBeUndefined();
  });
});
