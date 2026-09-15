const transactionRepository = require('./transaction.repository');
const { TRANSACTION_TYPES } = require('./transaction.model');
const logger = require('../config/logger');

function assertUserId(userId) {
  if (!userId) {
    throw new Error('userId is required');
  }
}

async function createTransaction(userId, { type, amountCents, currency, description, category, occurredAt }) {
  assertUserId(userId);

  if (!TRANSACTION_TYPES.includes(type)) {
    throw new Error(`type must be one of: ${TRANSACTION_TYPES.join(', ')}`);
  }
  if (!Number.isSafeInteger(amountCents) || amountCents < 0) {
    throw new Error('amountCents must be a non-negative safe integer');
  }

  const transaction = await transactionRepository.create({
    userId,
    type,
    amountCents,
    currency,
    description,
    category,
    occurredAt,
  });

  logger.info('Transaction created', {
    userId: String(userId),
    transactionId: String(transaction._id),
    type,
  });
  return transaction;
}

async function getTransactionsByUser(userId) {
  assertUserId(userId);
  return transactionRepository.findByUser(userId);
}

async function deleteTransaction(userId, transactionId) {
  assertUserId(userId);

  const deleted = await transactionRepository.deleteByIdForUser(transactionId, userId);

  if (!deleted) {
    logger.warn('Transaction delete denied or not found', {
      userId: String(userId),
      transactionId: String(transactionId),
    });
    throw new Error('Transaction not found');
  }

  logger.info('Transaction deleted', {
    userId: String(userId),
    transactionId: String(transactionId),
  });
  return deleted;
}

/**
 * Deletes ALL transactions belonging to the calling user only.
 * Callers must pass an authenticated req.user.id — never a client-supplied id.
 */
async function deleteAllForUser(userId) {
  assertUserId(userId);

  const result = await transactionRepository.deleteByUserId(userId);

  logger.warn('All transactions deleted for user', {
    userId: String(userId),
    deletedCount: result.deletedCount,
  });
  return result;
}

module.exports = {
  createTransaction,
  getTransactionsByUser,
  deleteTransaction,
  deleteAllForUser,
};
