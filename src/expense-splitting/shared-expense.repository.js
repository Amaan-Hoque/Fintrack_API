const { SharedExpense } = require('./shared-expense.model');

async function create(data) {
  return SharedExpense.create(data);
}

/**
 * Returns the expense only if userId is the creator or a listed participant.
 * Never fetch by _id alone.
 */
async function findByIdForMember(id, userId) {
  return SharedExpense.findOne({
    _id: id,
    $or: [{ creator: userId }, { 'participants.userId': userId }],
  });
}

async function findAllForMember(userId) {
  return SharedExpense.find({
    $or: [{ creator: userId }, { 'participants.userId': userId }],
  }).sort({ createdAt: -1 });
}

async function updateParticipantsForMember(id, userId, update) {
  return SharedExpense.findOneAndUpdate(
    { _id: id, $or: [{ creator: userId }, { 'participants.userId': userId }] },
    update,
    { new: true, runValidators: true },
  );
}

module.exports = {
  create,
  findByIdForMember,
  findAllForMember,
  updateParticipantsForMember,
};
