const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action_type: { type: String, enum: ['login', 'swap', 'coin transfer', 'chat message', 'course redemption'], required: true },
    description: { type: String },
    metadata: { type: mongoose.Schema.Types.Mixed },
    created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ActivityLog', activityLogSchema);
