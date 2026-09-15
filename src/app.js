const express = require('express');
const { stubAuth } = require('./middleware/auth');
const errorHandler = require('./middleware/error-handler');
const transactionRoutes = require('./transactions/transaction.routes');
const sharedExpenseRoutes = require('./expense-splitting/shared-expense.routes');

const app = express();

app.use(express.json());
app.use(stubAuth);

app.use('/api/transactions', transactionRoutes);
app.use('/api/expenses', sharedExpenseRoutes);

app.use(errorHandler);

module.exports = app;
