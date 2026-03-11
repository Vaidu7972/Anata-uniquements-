const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
    course_name: { type: String, required: true },
    description: { type: String },
    coin_price: { type: Number, required: true },
    category: { type: String, default: 'General' },
    instructor: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Course', courseSchema);
