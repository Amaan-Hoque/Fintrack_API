const sharedExpenseRepository = require('./shared-expense.repository');
const { SPLIT_TYPES } = require('./shared-expense.model');
const logger = require('../config/logger');

function assertUserId(userId) {
  if (!userId) {
    throw new Error('userId is required');
  }
}

function assertNonNegativeSafeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
}

function sumCents(participants, field) {
  return participants.reduce((total, p) => total + p[field], 0);
}

/**
 * Distributes totalAmountCents evenly across participants with no float
 * drift: base amount to everyone, then one extra cent each to the first
 * `remainder` participants in submitted array order.
 */
function computeEqualShares(totalAmountCents, participants) {
  const n = participants.length;
  const base = Math.floor(totalAmountCents / n);
  const remainder = totalAmountCents % n;

  return participants.map((p, index) => ({
    ...p,
    shareAmountCents: base + (index < remainder ? 1 : 0),
  }));
}

function validateParticipants(userId, { totalAmountCents, splitType, participants }) {
  if (!Array.isArray(participants) || participants.length < 2) {
    throw new Error('a shared expense requires at least 2 participants');
  }

  if (!participants.some((p) => String(p.userId) === String(userId))) {
    throw new Error('the creator must be included in participants');
  }

  participants.forEach((p) => assertNonNegativeSafeInteger(p.paidAmountCents, 'paidAmountCents'));

  let finalParticipants;

  if (splitType === 'CUSTOM') {
    participants.forEach((p) => assertNonNegativeSafeInteger(p.shareAmountCents, 'shareAmountCents'));

    if (sumCents(participants, 'shareAmountCents') !== totalAmountCents) {
      throw new Error('sum of shareAmountCents must equal totalAmountCents');
    }

    finalParticipants = participants;
  } else {
    finalParticipants = computeEqualShares(totalAmountCents, participants);
  }

  if (sumCents(finalParticipants, 'paidAmountCents') !== totalAmountCents) {
    throw new Error('sum of paidAmountCents must equal totalAmountCents');
  }

  return finalParticipants;
}

async function createSharedExpense(userId, { description, totalAmountCents, splitType, participants }) {
  assertUserId(userId);
  assertNonNegativeSafeInteger(totalAmountCents, 'totalAmountCents');

  if (!SPLIT_TYPES.includes(splitType)) {
    throw new Error(`splitType must be one of: ${SPLIT_TYPES.join(', ')}`);
  }

  const finalParticipants = validateParticipants(userId, { totalAmountCents, splitType, participants });

  const expense = await sharedExpenseRepository.create({
    creator: userId,
    description,
    totalAmountCents,
    splitType,
    participants: finalParticipants,
  });

  logger.info('Shared expense created', {
    userId: String(userId),
    expenseId: String(expense._id),
    splitType,
    participantCount: finalParticipants.length,
  });

  return expense;
}

async function updateParticipants(userId, expenseId, { participants, splitType }) {
  assertUserId(userId);

  const existing = await sharedExpenseRepository.findByIdForMember(expenseId, userId);

  if (!existing) {
    logger.warn('Shared expense update denied or not found', {
      userId: String(userId),
      expenseId: String(expenseId),
    });
    throw new Error('Shared expense not found');
  }

  if (existing.settledAt) {
    throw new Error('Cannot modify a settled expense; use the reversal flow');
  }

  const effectiveSplitType = splitType || existing.splitType;
  const finalParticipants = validateParticipants(existing.creator, {
    totalAmountCents: existing.totalAmountCents,
    splitType: effectiveSplitType,
    participants,
  });

  const updated = await sharedExpenseRepository.updateParticipantsForMember(expenseId, userId, {
    participants: finalParticipants,
    splitType: effectiveSplitType,
  });

  logger.info('Shared expense participants updated', {
    userId: String(userId),
    expenseId: String(expenseId),
  });

  return updated;
}

function settleExpense(participants) {
  const creditors = participants
    .filter((p) => p.net > 0)
    .map((p) => ({ userId: p.userId, amount: p.net }))
    .sort((a, b) => b.amount - a.amount || (a.userId < b.userId ? -1 : 1));

  const debtors = participants
    .filter((p) => p.net < 0)
    .map((p) => ({ userId: p.userId, amount: -p.net }))
    .sort((a, b) => b.amount - a.amount || (a.userId < b.userId ? -1 : 1));

  const edges = [];
  let ci = 0;
  let di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci];
    const debtor = debtors[di];
    const amount = Math.min(creditor.amount, debtor.amount);

    if (amount > 0) {
      edges.push({ from: debtor.userId, to: creditor.userId, amountCents: amount });
    }

    creditor.amount -= amount;
    debtor.amount -= amount;

    if (creditor.amount === 0) ci += 1;
    if (debtor.amount === 0) di += 1;
  }

  return edges;
}

function aggregateEdges(allEdges) {
  const ledger = new Map();

  allEdges.forEach(({ from, to, amountCents }) => {
    const fromStr = String(from);
    const toStr = String(to);
    const [a, b] = [fromStr, toStr].sort();
    const key = `${a}|${b}`;
    const signed = fromStr === a ? amountCents : -amountCents;
    ledger.set(key, (ledger.get(key) || 0) + signed);
  });

  return ledger;
}

function balancesForUser(ledger, userId) {
  const userIdStr = String(userId);
  const results = [];

  ledger.forEach((signed, key) => {
    if (signed === 0) return;

    const [a, b] = key.split('|');
    if (a !== userIdStr && b !== userIdStr) return;

    const [debtor, creditor] = signed > 0 ? [a, b] : [b, a];
    const amountCents = Math.abs(signed);
    const counterpartUserId = debtor === userIdStr ? creditor : debtor;
    const direction = debtor === userIdStr ? 'OWES' : 'OWED_BY';

    results.push({ counterpartUserId, amountCents, direction });
  });

  return results;
}

async function getPendingBalances(userId) {
  assertUserId(userId);

  const expenses = await sharedExpenseRepository.findAllForMember(userId);

  const allEdges = expenses.flatMap((expense) => {
    const participants = expense.participants.map((p) => ({
      userId: String(p.userId),
      net: p.paidAmountCents - p.shareAmountCents,
    }));

    return settleExpense(participants);
  });

  const ledger = aggregateEdges(allEdges);
  const result = balancesForUser(ledger, userId);

  logger.info('Pending balances computed', {
    userId: String(userId),
    expenseCount: expenses.length,
    pairCount: result.length,
  });

  return result;
}

module.exports = {
  createSharedExpense,
  updateParticipants,
  getPendingBalances,
  computeEqualShares,
  settleExpense,
  aggregateEdges,
  balancesForUser,
};
