jest.mock('./shared-expense.repository');
jest.mock('../config/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const sharedExpenseRepository = require('./shared-expense.repository');
const {
  createSharedExpense,
  updateParticipants,
  getPendingBalances,
  computeEqualShares,
  settleExpense,
  aggregateEdges,
  balancesForUser,
} = require('./shared-expense.service');

const A = 'user-a';
const B = 'user-b';
const C = 'user-c';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('computeEqualShares', () => {
  it('distributes remainder cents to the first participants in order', () => {
    const result = computeEqualShares(1000, [{ userId: A }, { userId: B }, { userId: C }]);

    expect(result.map((p) => p.shareAmountCents)).toEqual([334, 333, 333]);
    expect(result.reduce((sum, p) => sum + p.shareAmountCents, 0)).toBe(1000);
  });
});

describe('createSharedExpense', () => {
  it('throws when userId is missing', async () => {
    await expect(createSharedExpense(null, {})).rejects.toThrow('userId is required');
  });

  it('throws when fewer than 2 participants are given', async () => {
    await expect(
      createSharedExpense(A, {
        totalAmountCents: 100,
        splitType: 'EQUAL',
        participants: [{ userId: A, paidAmountCents: 100 }],
      }),
    ).rejects.toThrow('at least 2 participants');
  });

  it('throws when the creator is not among the participants', async () => {
    await expect(
      createSharedExpense(A, {
        totalAmountCents: 100,
        splitType: 'EQUAL',
        participants: [
          { userId: B, paidAmountCents: 50 },
          { userId: C, paidAmountCents: 50 },
        ],
      }),
    ).rejects.toThrow('creator must be included');
  });

  it('throws when CUSTOM share sum does not equal totalAmountCents', async () => {
    await expect(
      createSharedExpense(A, {
        totalAmountCents: 100,
        splitType: 'CUSTOM',
        participants: [
          { userId: A, shareAmountCents: 40, paidAmountCents: 100 },
          { userId: B, shareAmountCents: 40, paidAmountCents: 0 },
        ],
      }),
    ).rejects.toThrow('sum of shareAmountCents');
  });

  it('throws when paidAmountCents sum does not equal totalAmountCents (EQUAL split)', async () => {
    await expect(
      createSharedExpense(A, {
        totalAmountCents: 100,
        splitType: 'EQUAL',
        participants: [
          { userId: A, paidAmountCents: 50 },
          { userId: B, paidAmountCents: 40 },
        ],
      }),
    ).rejects.toThrow('sum of paidAmountCents');
  });

  it('creates a valid EQUAL split and logs success', async () => {
    sharedExpenseRepository.create.mockResolvedValue({ _id: 'expense-1' });

    const result = await createSharedExpense(A, {
      description: 'Dinner',
      totalAmountCents: 1000,
      splitType: 'EQUAL',
      participants: [
        { userId: A, paidAmountCents: 1000 },
        { userId: B, paidAmountCents: 0 },
        { userId: C, paidAmountCents: 0 },
      ],
    });

    expect(sharedExpenseRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        creator: A,
        participants: [
          { userId: A, paidAmountCents: 1000, shareAmountCents: 334 },
          { userId: B, paidAmountCents: 0, shareAmountCents: 333 },
          { userId: C, paidAmountCents: 0, shareAmountCents: 333 },
        ],
      }),
    );
    expect(result).toEqual({ _id: 'expense-1' });
  });
});

describe('updateParticipants', () => {
  it('throws and logs a warning when the expense is not found', async () => {
    sharedExpenseRepository.findByIdForMember.mockResolvedValue(null);

    await expect(updateParticipants(A, 'expense-1', { participants: [] })).rejects.toThrow('not found');
  });

  it('throws when the expense is settled', async () => {
    sharedExpenseRepository.findByIdForMember.mockResolvedValue({
      creator: A,
      totalAmountCents: 100,
      splitType: 'EQUAL',
      settledAt: new Date(),
    });

    await expect(
      updateParticipants(A, 'expense-1', {
        participants: [{ userId: A, paidAmountCents: 100 }, { userId: B, paidAmountCents: 0 }],
      }),
    ).rejects.toThrow('settled expense');
  });

  it('rejects dropping below 2 participants', async () => {
    sharedExpenseRepository.findByIdForMember.mockResolvedValue({
      creator: A,
      totalAmountCents: 100,
      splitType: 'EQUAL',
      settledAt: null,
    });

    await expect(
      updateParticipants(A, 'expense-1', {
        participants: [{ userId: A, paidAmountCents: 100 }],
      }),
    ).rejects.toThrow('at least 2 participants');
  });
});

describe('settleExpense', () => {
  it('produces deterministic edges for an unequal multi-party net', () => {
    const edges = settleExpense([
      { userId: 'A', net: 60 },
      { userId: 'B', net: -30 },
      { userId: 'C', net: -30 },
    ]);

    expect(edges).toEqual([
      { from: 'B', to: 'A', amountCents: 30 },
      { from: 'C', to: 'A', amountCents: 30 },
    ]);
  });
});

describe('aggregateEdges / balancesForUser', () => {
  it('nets balances across multiple expenses per the worked example', () => {
    const edges = [
      { from: 'B', to: 'A', amountCents: 30 },
      { from: 'C', to: 'A', amountCents: 30 },
      { from: 'A', to: 'B', amountCents: 25 },
    ];

    const ledger = aggregateEdges(edges);
    const result = balancesForUser(ledger, 'A');

    expect(result).toEqual(
      expect.arrayContaining([
        { counterpartUserId: 'B', amountCents: 5, direction: 'OWED_BY' },
        { counterpartUserId: 'C', amountCents: 30, direction: 'OWED_BY' },
      ]),
    );
    expect(result).toHaveLength(2);
  });

  it('omits pairs that net to exactly zero', () => {
    const ledger = aggregateEdges([
      { from: 'A', to: 'B', amountCents: 20 },
      { from: 'B', to: 'A', amountCents: 20 },
    ]);

    expect(balancesForUser(ledger, 'A')).toEqual([]);
  });
});

describe('getPendingBalances', () => {
  it('throws when userId is missing', async () => {
    await expect(getPendingBalances(null)).rejects.toThrow('userId is required');
  });

  it('computes end-to-end balances from repository expenses', async () => {
    sharedExpenseRepository.findAllForMember.mockResolvedValue([
      {
        participants: [
          { userId: A, paidAmountCents: 90, shareAmountCents: 30 },
          { userId: B, paidAmountCents: 0, shareAmountCents: 30 },
          { userId: C, paidAmountCents: 0, shareAmountCents: 30 },
        ],
      },
      {
        participants: [
          { userId: A, paidAmountCents: 0, shareAmountCents: 25 },
          { userId: B, paidAmountCents: 50, shareAmountCents: 25 },
        ],
      },
    ]);

    const result = await getPendingBalances(A);

    expect(result).toEqual(
      expect.arrayContaining([
        { counterpartUserId: B, amountCents: 5, direction: 'OWED_BY' },
        { counterpartUserId: C, amountCents: 30, direction: 'OWED_BY' },
      ]),
    );
  });
});
