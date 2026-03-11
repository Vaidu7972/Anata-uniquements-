const mongoose = require('mongoose');

const userCourseSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    course_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    redeemed_at: { type: Date, default: Date.now },
    access_status: { type: String, enum: ['Locked', 'Accessible Now'], default: 'Accessible Now' }
});

module.exports = mongoose.model('UserCourse', userCourseSchema);
