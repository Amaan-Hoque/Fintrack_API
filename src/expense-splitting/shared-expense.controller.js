const sharedExpenseService = require('./shared-expense.service');

async function create(req, res, next) {
  try {
    const expense = await sharedExpenseService.createSharedExpense(req.user.id, req.body);
    res.status(201).json(expense);
  } catch (err) {
    next(err);
  }
}

async function getBalances(req, res, next) {
  try {
    const balances = await sharedExpenseService.getPendingBalances(req.user.id);
    res.status(200).json(balances);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  create,
  getBalances,
};
