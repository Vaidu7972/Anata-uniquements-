const mongoose = require('mongoose');

const userAchievementSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    achievement_type: { type: String, required: true },
    description: { type: String },
    rating: { type: Number },
    review: { type: String },
    created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('UserAchievement', userAchievementSchema);
