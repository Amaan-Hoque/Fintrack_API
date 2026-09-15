const express = require('express');
const sharedExpenseController = require('./shared-expense.controller');

const router = express.Router();

// '/balances' must stay ahead of any future '/:id' route so it isn't
// captured as an :id param.
router.get('/balances', sharedExpenseController.getBalances);
router.post('/', sharedExpenseController.create);

module.exports = router;
