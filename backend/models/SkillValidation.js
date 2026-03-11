const mongoose = require('mongoose');

const skillValidationSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    skillId: { type: mongoose.Schema.Types.ObjectId, ref: 'Skill', required: true },
    previousGrade: { type: String, enum: ['A', 'B', 'C', 'D', 'E'] },
    newGrade: { type: String, enum: ['A', 'B', 'C', 'D', 'E'], required: true },
    validatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    validatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('SkillValidation', skillValidationSchema);
