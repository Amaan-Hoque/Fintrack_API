const { Transaction } = require('./transaction.model');

async function create(data) {
  return Transaction.create(data);
}

async function findByUser(userId) {
  return Transaction.find({ userId }).sort({ createdAt: -1 });
}

async function findByIdForUser(id, userId) {
  return Transaction.findOne({ _id: id, userId });
}

async function deleteByIdForUser(id, userId) {
  return Transaction.findOneAndDelete({ _id: id, userId });
}

/**
 * Deletes every transaction belonging to a single tenant.
 * `userId` is required — an undefined/null userId would make Mongo
 * treat { userId } as an empty filter and wipe the whole collection.
 */
async function deleteByUserId(userId) {
  if (!userId) {
    throw new Error('deleteByUserId requires a userId');
  }
  return Transaction.deleteMany({ userId });
}

module.exports = {
  create,
  findByUser,
  findByIdForUser,
  deleteByIdForUser,
  deleteByUserId,
};
