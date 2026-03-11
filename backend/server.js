require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const User = require('./models/User');
const Skill = require('./models/Skill');
const Wallet = require('./models/Wallet');
const Course = require('./models/Course');
const Trade = require('./models/Trade');

// Lightweight message and review models (not present in models/ directory)
const mongooseSchema = mongoose.Schema;
const messageSchema = new mongooseSchema({
    trade: { type: mongoose.Schema.Types.ObjectId, ref: 'Trade', required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    message_text: { type: String },
    createdAt: { type: Date, default: Date.now }
});
const reviewSchema = new mongooseSchema({
    trade: { type: mongoose.Schema.Types.ObjectId, ref: 'Trade', required: true },
    reviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    rating: { type: Number },
    comment: { type: String },
    createdAt: { type: Date, default: Date.now }
});

const Message = mongoose.model('Message', messageSchema);
const Review = mongoose.model('Review', reviewSchema);

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from the frontend folder
app.use(express.static(path.join(__dirname, '../frontend')));

// Connect to MongoDB
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || '';
if (!MONGO_URI) {
    console.error('MONGO_URI not set in environment. Exiting.');
    process.exit(1);
}

mongoose.connect(MONGO_URI, { dbName: process.env.MONGO_DB || undefined })
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => {
        console.error('MongoDB connection error:', err);
        process.exit(1);
    });

// Secret for JWT
const JWT_SECRET = process.env.JWT_SECRET || 'ananta_super_secret_key_v1';

// Middleware to protect routes
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ message: 'Access Denied: No Token Provided!' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: 'Invalid Token!' });
        req.user = user;
        next();
    });
};



// Root health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Backend running' });
});

// Register User
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, phone, password, role } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const existing = await User.findOne({ email });
        if (existing) return res.status(400).json({ error: 'Email already exists!' });

        const user = await User.create({ name, email, phone, password: hashedPassword, role: role || 'user' });

        await Wallet.create({ user: user._id });

        res.status(201).json({ message: 'User registered successfully!', userId: user._id });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to register user.' });
    }
});

// Login User
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: 'User not found!' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ message: 'Invalid credentials!' });

        const token = jwt.sign({ userId: user._id.toString(), role: user.role }, JWT_SECRET, { expiresIn: '24h' });

        res.json({ message: 'Login successful!', token, user: { id: user._id, name: user.name, role: user.role } });
    } catch (err) {
        res.status(500).json({ error: 'Login failed.' });
    }
});

// Get Profile
app.get('/api/profile', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select('name email phone role');
        if (!user) return res.status(404).json({ message: 'User not found' });
        const skills = await Skill.find({ user: req.user.userId });
        res.json({ user, skills });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch profile.' });
    }
});



// Add Skill
app.post('/api/skills', authenticateToken, async (req, res) => {
    try {
        const { skill_name, skill_type, skill_grade } = req.body;
        await Skill.create({ user: req.user.userId, skill_name, skill_type, skill_grade });
        res.status(201).json({ message: 'Skill added successfully!' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to add skill.' });
    }
});

// Get User Skills
app.get('/api/skills', authenticateToken, async (req, res) => {
    try {
        const skills = await Skill.find({ user: req.user.userId });
        res.json(skills);
    } catch (err) {
        res.status(500).json({ error: 'Failed to get skills.' });
    }
});



// AI Matching Logic
app.get('/api/matches', authenticateToken, async (req, res) => {
    try {
        const requiredSkills = await Skill.find({ user: req.user.userId, skill_type: 'required' });
        if (requiredSkills.length === 0) {
            return res.json({ message: 'Please add required skills to find matches.', matches: [] });
        }

        const allOffered = await Skill.find({ skill_type: 'offered', user: { $ne: req.user.userId } }).populate('user', 'name');

        // Simple synonym/category dictionary for AI mapping
        const skillCategories = {
            'development': ['web', 'frontend', 'backend', 'fullstack', 'programming', 'coding', 'js', 'python', 'react', 'node'],
            'design': ['ui', 'ux', 'graphic', 'visual', 'figma', 'photoshop', 'creative'],
            'data': ['ai', 'machine learning', 'ml', 'database', 'sql', 'analytics', 'python'],
            'marketing': ['seo', 'social media', 'ads', 'content', 'growth'],
            'management': ['project', 'scrum', 'agile', 'product']
        };

        const calculateScore = (reqSkill, offSkill) => {
            const rName = reqSkill.skill_name.toLowerCase();
            const oName = offSkill.skill_name.toLowerCase();

            // Exact Match
            if (rName === oName) return 100;

            // Partial Match / Category Match
            let score = 0;
            for (const cat in skillCategories) {
                const keywords = skillCategories[cat];
                const rInCat = keywords.some(k => rName.includes(k));
                const oInCat = keywords.some(k => oName.includes(k));
                if (rInCat && oInCat) {
                    score = 70; // High confidence category match
                    break;
                }
            }

            // Keyword overlap
            if (score === 0) {
                const rWords = rName.split(' ');
                const oWords = oName.split(' ');
                const overlap = rWords.filter(w => w.length > 2 && oWords.includes(w));
                if (overlap.length > 0) score = 40;
            }

            // Grade Match bonus/penalty
            const grades = { 'A': 5, 'B': 4, 'C': 3, 'D': 2, 'E': 1 };
            if (score > 0) {
                const rG = grades[reqSkill.skill_grade] || 0;
                const oG = grades[offSkill.skill_grade] || 0;
                if (oG >= rG) score += 10; // Better or equal grade
                else score -= (rG - oG) * 5; // Penalty for lower grade
            }

            return Math.min(100, Math.max(0, score));
        };

        const matches = [];

        allOffered.forEach(offered => {
            let bestScore = 0;
            let matchedOn = '';
            requiredSkills.forEach(reqSkill => {
                const score = calculateScore(reqSkill, offered);
                if (score > bestScore) {
                    bestScore = score;
                    matchedOn = reqSkill.skill_name;
                }
            });

            if (bestScore >= 30) {
                matches.push({
                    user_id: offered.user._id,
                    name: offered.user.name,
                    skill_name: offered.skill_name,
                    skill_grade: offered.skill_grade,
                    matched_on: matchedOn,
                    score: bestScore,
                    match_type: bestScore >= 85 ? 'Neural Sync (High)' : (bestScore >= 60 ? 'Optimal Match' : 'Approx Match')
                });
            }
        });

        matches.sort((a, b) => b.score - a.score);
        res.json({ matches: matches.slice(0, 12) });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Matching algorithm failed.' });
    }
});



// Create Trade Request
app.post('/api/trades', authenticateToken, async (req, res) => {
    try {
        const { receiver_id, skills_exchanged } = req.body;
        const trade = await Trade.create({ requester: req.user.userId, receiver: receiver_id, skills_exchanged, status: 'pending' });
        res.status(201).json({ message: 'Trade request sent!', tradeId: trade._id });
    } catch (err) {
        res.status(500).json({ error: 'Failed to send trade request.' });
    }
});

// Get Trades for user
app.get('/api/trades', authenticateToken, async (req, res) => {
    try {
        const trades = await Trade.find({ $or: [{ requester: req.user.userId }, { receiver: req.user.userId }] })
            .populate('requester', 'name')
            .populate('receiver', 'name')
            .sort({ createdAt: -1 });

        // Map to frontend-friendly shape used throughout app.js
        const mapped = trades.map(t => ({
            trade_id: t._id.toString(),
            requester_id: t.requester ? t.requester._id.toString() : null,
            receiver_id: t.receiver ? t.receiver._id.toString() : null,
            requester_name: t.requester ? t.requester.name : null,
            receiver_name: t.receiver ? t.receiver.name : null,
            skills_exchanged: t.skills_exchanged,
            status: t.status,
            duration_days: t.duration_days,
            satisfaction: t.satisfaction,
            created_at: t.createdAt
        }));

        res.json(mapped);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch trades.' });
    }
});

// Accept Trade
app.put('/api/trades/:id/accept', authenticateToken, async (req, res) => {
    try {
        const tradeId = req.params.id;
        const trade = await Trade.findOneAndUpdate({ _id: tradeId, receiver: req.user.userId, status: 'pending' }, { status: 'accepted' });
        if (!trade) return res.status(404).json({ error: 'Trade not found or unauthorized' });
        res.json({ message: 'Trade accepted!' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to accept trade.' });
    }
});

// Reject Trade
app.put('/api/trades/:id/reject', authenticateToken, async (req, res) => {
    try {
        const tradeId = req.params.id;
        const trade = await Trade.findOneAndUpdate({ _id: tradeId, receiver: req.user.userId, status: 'pending' }, { status: 'rejected' });
        if (!trade) return res.status(404).json({ error: 'Trade not found or unauthorized' });
        res.json({ message: 'Trade rejected.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to reject trade.' });
    }
});
app.put('/api/trades/:id/complete', authenticateToken, async (req, res) => {
    try {
        const tradeId = req.params.id;
        const { satisfaction, duration_days, skill_grade } = req.body;

        // Simple Coin Calculation based on rules
        let durationCoins = (duration_days || 1) * 5;

        let gradeCoins = 0;
        if (skill_grade === 'A') gradeCoins = 20;
        else if (skill_grade === 'B') gradeCoins = 15;
        else if (skill_grade === 'C') gradeCoins = 10;
        else if (skill_grade === 'D') gradeCoins = 5;
        else gradeCoins = 2;

        let satisfactionCoins = 0;
        if (satisfaction === 'Excellent') satisfactionCoins = 10;
        else if (satisfaction === 'Good') satisfactionCoins = 5;
        else if (satisfaction === 'Average') satisfactionCoins = 2;

        const totalAwarded = durationCoins + gradeCoins + satisfactionCoins;

        const trade = await Trade.findOneAndUpdate({ _id: tradeId, status: 'accepted' }, { status: 'completed', duration_days: duration_days || 1, satisfaction: satisfaction || 'Average' });
        if (!trade) return res.status(400).json({ error: 'Trade cannot be completed. It might not be accepted yet or already completed.' });

        const t = trade;
        await Wallet.updateMany({ user: { $in: [t.requester, t.receiver] } }, { $inc: { total_coins: totalAwarded, earned_coins: totalAwarded } });

        res.json({ message: 'Trade completed and coins awarded!', coinsAwarded: totalAwarded, coinsAwared: totalAwarded });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to complete trade.' });
    }
});



// Add Review after Trade
app.post('/api/reviews', authenticateToken, async (req, res) => {
    try {
        const { trade_id, rating, comment } = req.body;
        const trade = await Trade.findById(trade_id);
        if (!trade || trade.status !== 'completed') return res.status(400).json({ error: 'Trade must be completed before leaving a review.' });
        await Review.create({ trade: trade_id, reviewer: req.user.userId, rating, comment });
        res.status(201).json({ message: 'Review added successfully!' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to add review.' });
    }
});



// Send Message
app.post('/api/messages', authenticateToken, async (req, res) => {
    try {
        const { trade_id, message_text } = req.body;
        const trade = await Trade.findById(trade_id);
        if (!trade) return res.status(404).json({ error: 'Trade not found.' });
        if (trade.requester.toString() !== req.user.userId && trade.receiver.toString() !== req.user.userId) {
            return res.status(403).json({ error: 'Unauthorized to chat in this trade.' });
        }

        await Message.create({ trade: trade_id, sender: req.user.userId, message_text });
        res.status(201).json({ message: 'Message sent!' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to transmit message.' });
    }
});

// Get Messages
app.get('/api/messages/:tradeId', authenticateToken, async (req, res) => {
    try {
        const tradeId = req.params.tradeId;
        const trade = await Trade.findById(tradeId);
        if (!trade) return res.status(404).json({ error: 'Trade not found.' });
        if (trade.requester.toString() !== req.user.userId && trade.receiver.toString() !== req.user.userId) {
            return res.status(403).json({ error: 'Unauthorized.' });
        }

        const messages = await Message.find({ trade: tradeId }).populate('sender', 'name').sort({ createdAt: 1 });

        // Map to frontend expected shape
        const mapped = messages.map(m => ({
            message_id: m._id.toString(),
            trade_id: m.trade.toString(),
            sender_id: m.sender ? m.sender._id.toString() : null,
            sender_name: m.sender ? m.sender.name : null,
            message_text: m.message_text,
            created_at: m.createdAt
        }));

        res.json(mapped);
    } catch (err) {
        res.status(500).json({ error: 'Failed to retrieve messages.' });
    }
});



// Get Coins
app.get('/api/wallet', authenticateToken, async (req, res) => {
    try {
        const wallet = await Wallet.findOne({ user: req.user.userId });
        if (!wallet) return res.status(404).json({ message: 'Wallet not found' });
        res.json(wallet);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch wallet info.' });
    }
});



// Get Courses
app.get('/api/courses', async (req, res) => {
    try {
        const courses = await Course.find().sort({ createdAt: -1 });
        res.json(courses);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch courses.' });
    }
});

// Buy Course
app.post('/api/courses/:id/buy', authenticateToken, async (req, res) => {
    try {
        const courseId = req.params.id;
        const course = await Course.findById(courseId);
        if (!course) return res.status(404).json({ error: 'Course not found' });

        const wallet = await Wallet.findOne({ user: req.user.userId });
        if (!wallet) return res.status(404).json({ error: 'Wallet not found' });

        if (wallet.total_coins < course.coin_price) return res.status(400).json({ error: 'Insufficient virtual coins to buy this course.' });

        wallet.total_coins -= course.coin_price;
        wallet.used_coins += course.coin_price;
        await wallet.save();

        res.json({ message: `Successfully purchased ${course.course_name}!` });
    } catch (err) {
        res.status(500).json({ error: 'Failed to buy course.' });
    }
});



// Discover all nodes (users)
app.get('/api/users/discover', authenticateToken, async (req, res) => {
    try {
        // Safely build match stage: some clients may have legacy numeric IDs in token
        const matchStage = {};
        try {
            if (mongoose.Types.ObjectId.isValid(req.user.userId)) {
                matchStage._id = { $ne: mongoose.Types.ObjectId(req.user.userId) };
            }
        } catch (e) {
            // ignore cast issues and do not exclude current user
        }

        let users = await User.aggregate([
            { $match: matchStage },
            { $limit: 20 },
            {
                $lookup: {
                    from: 'skills',
                    localField: '_id',
                    foreignField: 'user',
                    as: 'skills'
                }
            },
            { $project: { name: 1, role: 1, skills: '$skills.skill_name' } }
        ]);

        // Map skills array to comma-separated string and include user_id for frontend
        users = users.map(u => ({
            user_id: u._id.toString(),
            name: u.name,
            role: u.role,
            skills: Array.isArray(u.skills) ? u.skills.join(',') : ''
        }));

        res.json(users);
    } catch (err) {
        res.status(500).json({ error: 'Discovery failed.' });
    }
});



app.get('/api/admin/users', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
    try {
        const users = await User.find().select('name email role createdAt');
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch users.' });
    }
});

app.post('/api/admin/courses', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
    try {
        const { course_name, description, coin_price } = req.body;
        await Course.create({ course_name, description, coin_price });
        res.status(201).json({ message: 'Course created successfully!' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create course.' });
    }
});

app.put('/api/admin/skills/:id/validate', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
    try {
        const skillId = req.params.id;
        const { new_grade } = req.body;
        const skill = await Skill.findByIdAndUpdate(skillId, { skill_grade: new_grade });
        if (!skill) return res.status(404).json({ error: 'Skill not found.' });
        res.json({ message: 'Skill validated and grade updated.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to validate skill.' });
    }
});

app.get('/api/admin/trades', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
    try {
        const trades = await Trade.find().sort({ createdAt: -1 });
        res.json(trades);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch all trades.' });
    }
});

// Reset Password
app.post('/api/reset-password', async (req, res) => {
    try {
        const { email, newPassword } = req.body;

        if (!email || !newPassword) {
            return res.status(400).json({ error: 'Email and new password are required.' });
        }

        // Check if user exists
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ error: 'No account found with this email address.' });
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        user.password = hashedPassword;
        await user.save();
        res.json({ message: 'Password reset successfully!' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to reset password.' });
    }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Ananta Techtonic API Server is running on port ${PORT}`);
});

// Seed some initial courses if missing
async function seedCourses() {
    try {
        const count = await Course.countDocuments();
        if (count === 0) {
            await Course.create([
                { course_name: 'Web Development Masterclass', description: 'Learn from scratch', coin_price: 50 },
                { course_name: 'AI Fundamentals', description: 'Basics of AI algorithms', coin_price: 100 },
                { course_name: 'Graphic Design 101', description: 'Intro to visual design', coin_price: 30 },
                { course_name: 'Data Structures & Alg', description: 'Deep dive into algos', coin_price: 150 }
            ]);
            console.log('Seeded initial courses.');
        }
    } catch (err) {
        console.error('Failed to seed courses:', err);
    }
}

seedCourses();
