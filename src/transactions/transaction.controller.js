const transactionService = require('./transaction.service');

async function create(req, res, next) {
  try {
    const transaction = await transactionService.createTransaction(req.user.id, req.body);
    res.status(201).json(transaction);
  } catch (err) {
    next(err);
  }
}

async function listByUser(req, res, next) {
  try {
    const transactions = await transactionService.getTransactionsByUser(req.user.id);
    res.status(200).json(transactions);
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await transactionService.deleteTransaction(req.user.id, req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function removeAll(req, res, next) {
  try {
    const result = await transactionService.deleteAllForUser(req.user.id);
    res.status(200).json({ deletedCount: result.deletedCount });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  create,
  listByUser,
  remove,
  removeAll,
};
