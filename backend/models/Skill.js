const mongoose = require('mongoose');

const skillSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    skill_name: { type: String, required: true },
    skill_type: { type: String, enum: ['offered', 'required'], required: true },
    skill_grade: { type: String, enum: ['A', 'B', 'C', 'D', 'E'], required: true }
});

module.exports = mongoose.model('Skill', skillSchema);
