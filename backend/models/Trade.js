const mongoose = require('mongoose');

const tradeSchema = new mongoose.Schema({
    requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    skills_exchanged: { type: String, required: true },
    status: { type: String, enum: ['pending', 'accepted', 'rejected', 'completed'], default: 'pending' },
    duration_days: { type: Number, default: 1 },
    satisfaction: { type: String, enum: ['Excellent', 'Good', 'Average', 'Poor'] },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Trade', tradeSchema);
