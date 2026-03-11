const mongoose = require('mongoose');

const coinTransactionSchema = new mongoose.Schema({
    sender_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // null if system
    receiver_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    transaction_type: { type: String, enum: ['swap_reward', 'course_purchase', 'transfer', 'bonus'], required: true },
    reference_id: { type: mongoose.Schema.Types.ObjectId }, // e.g. Trade ID or Course ID
    status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'completed' },
    created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('CoinTransaction', coinTransactionSchema);
