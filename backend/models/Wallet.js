const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    total_coins: { type: Number, default: 0 },
    earned_coins: { type: Number, default: 0 },
    used_coins: { type: Number, default: 0 }
});

module.exports = mongoose.model('Wallet', walletSchema);
