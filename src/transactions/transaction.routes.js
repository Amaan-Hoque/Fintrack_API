const express = require('express');
const transactionController = require('./transaction.controller');

const router = express.Router();

router.post('/', transactionController.create);
router.get('/', transactionController.listByUser);
router.delete('/:id', transactionController.remove);
router.delete('/', transactionController.removeAll);

module.exports = router;
