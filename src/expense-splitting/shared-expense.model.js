const { mongoose } = require('../config/db');

const SPLIT_TYPES = ['EQUAL', 'CUSTOM'];

const participantSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    shareAmountCents: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isSafeInteger,
        message: 'shareAmountCents must be a non-negative safe integer',
      },
    },
    paidAmountCents: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isSafeInteger,
        message: 'paidAmountCents must be a non-negative safe integer',
      },
    },
  },
  { _id: false },
);

const sharedExpenseSchema = new mongoose.Schema(
  {
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    description: {
      type: String,
      trim: true,
    },
    totalAmountCents: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isSafeInteger,
        message: 'totalAmountCents must be a non-negative safe integer',
      },
    },
    splitType: {
      type: String,
      enum: SPLIT_TYPES,
      required: true,
    },
    participants: {
      type: [participantSchema],
      required: true,
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length >= 2,
        message: 'participants must contain at least 2 entries',
      },
    },
    settledAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

sharedExpenseSchema.index({ creator: 1, createdAt: -1 });
sharedExpenseSchema.index({ 'participants.userId': 1 });

const SharedExpense = mongoose.model('SharedExpense', sharedExpenseSchema);

module.exports = { SharedExpense, SPLIT_TYPES };
