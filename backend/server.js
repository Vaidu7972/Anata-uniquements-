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
const SkillValidation = require('./models/SkillValidation');
const ActivityLog = require('./models/ActivityLog');
const ChatMessage = require('./models/ChatMessage');
const UserAchievement = require('./models/UserAchievement');
const CoinTransaction = require('./models/CoinTransaction');
const UserCourse = require('./models/UserCourse');

const crypto = require('crypto');
const ENCRYPTION_KEY = (process.env.ENCRYPTION_KEY || 'ananta_techtonic_secret_32bytes_!!').substring(0, 32).padEnd(32, '0');
const IV_LENGTH = 16;

function encrypt(text) {
    try {
        let iv = crypto.randomBytes(IV_LENGTH);
        let cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
        let encrypted = cipher.update(text);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        return iv.toString('hex') + ':' + encrypted.toString('hex');
    } catch (e) {
        console.error('Encryption error:', e);
        return text;
    }
}

function decrypt(text) {
    try {
        let textParts = text.split(':');
        if (textParts.length < 2) return text;
        let iv = Buffer.from(textParts.shift(), 'hex');
        let encryptedText = Buffer.from(textParts.join(':'), 'hex');
        let decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (e) {
        console.error('Decryption error:', e);
        return text;
    }
}

async function logActivity(userId, actionType, description, metadata = {}) {
    try {
        await ActivityLog.create({ user_id: userId, action_type: actionType, description, metadata });
    } catch (err) {
        console.error('Failed to log activity:', err);
    }
}

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

        await logActivity(user._id, 'login', `User ${user.name} logged in`);

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
        // Atomic transaction simulation (using Mongoose updateMany but adding history)
        await Wallet.updateMany({ user: { $in: [t.requester, t.receiver] } }, { $inc: { total_coins: totalAwarded, earned_coins: totalAwarded } });

        // Create Coin Transactions
        await CoinTransaction.create({
            receiver_id: t.requester,
            amount: totalAwarded,
            transaction_type: 'swap_reward',
            reference_id: tradeId,
            status: 'completed'
        });
        await CoinTransaction.create({
            receiver_id: t.receiver,
            amount: totalAwarded,
            transaction_type: 'swap_reward',
            reference_id: tradeId,
            status: 'completed'
        });

        // Log Swap
        await logActivity(t.requester, 'swap', `Completed swap with ${t.receiver_name}`, { trade_id: tradeId, coins: totalAwarded });
        await logActivity(t.receiver, 'swap', `Completed swap with ${t.requester_name}`, { trade_id: tradeId, coins: totalAwarded });

        // Achievements - First Exchange
        const requesterTrades = await Trade.countDocuments({ requester: t.requester, status: 'completed' });
        if (requesterTrades === 1) {
            await UserAchievement.create({
                user_id: t.requester,
                achievement_type: 'First Successful Exchange',
                description: 'Completed your first swap on Anata Techtonic'
            });
        }
        const receiverTrades = await Trade.countDocuments({ receiver: t.receiver, status: 'completed' });
        if (receiverTrades === 1) {
            await UserAchievement.create({
                user_id: t.receiver,
                achievement_type: 'First Successful Exchange',
                description: 'Completed your first swap on Anata Techtonic'
            });
        }

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
        
        // Also save to secure ChatMessage
        const receiver_id = trade.requester.toString() === req.user.userId ? trade.receiver : trade.requester;
        await ChatMessage.create({
            sender_id: req.user.userId,
            receiver_id: receiver_id,
            encrypted_message: encrypt(message_text)
        });

        await logActivity(req.user.userId, 'chat message', `Sent message in trade ${trade_id}`, { trade_id });

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

        // Track redemption
        await UserCourse.create({
            user_id: req.user.userId,
            course_id: courseId,
            access_status: 'Accessible Now'
        });

        // Add coin transaction
        await CoinTransaction.create({
            sender_id: req.user.userId,
            receiver_id: null, // to system
            amount: course.coin_price,
            transaction_type: 'course_purchase',
            reference_id: courseId,
            status: 'completed'
        });

        await logActivity(req.user.userId, 'course redemption', `Redeemed course: ${course.course_name}`, { course_id: courseId });

        res.json({ message: `Successfully purchased ${course.course_name}!` });
    } catch (err) {
        res.status(500).json({ error: 'Failed to buy course.' });
    }
});

// GET user achievements
app.get('/api/achievements', authenticateToken, async (req, res) => {
    try {
        const achievements = await UserAchievement.find({ user_id: req.user.userId }).sort({ created_at: -1 });
        res.json(achievements);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch achievements.' });
    }
});

// UPDATE achievement with review/rating
app.put('/api/achievements/:id', authenticateToken, async (req, res) => {
    try {
        const { rating, review } = req.body;
        const achievement = await UserAchievement.findOneAndUpdate(
            { _id: req.params.id, user_id: req.user.userId },
            { rating, review },
            { new: true }
        );
        if (!achievement) return res.status(404).json({ error: 'Achievement not found.' });
        res.json({ message: 'Achievement updated!', achievement });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update achievement.' });
    }
});

// GET secure chat history
app.get('/api/chat/history', authenticateToken, async (req, res) => {
    try {
        const messages = await ChatMessage.find({
            $or: [{ sender_id: req.user.userId }, { receiver_id: req.user.userId }],
            is_deleted: false
        })
        .populate('sender_id', 'name')
        .populate('receiver_id', 'name')
        .sort({ created_at: -1 });

        const decryptedMessages = messages.map(m => ({
            id: m._id,
            sender_id: m.sender_id._id,
            sender_name: m.sender_id.name,
            receiver_id: m.receiver_id._id,
            receiver_name: m.receiver_id.name,
            message: decrypt(m.encrypted_message),
            created_at: m.created_at
        }));

        res.json(decryptedMessages);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch chat history.' });
    }
});

// GET my courses status
app.get('/api/my-courses', authenticateToken, async (req, res) => {
    try {
        const allCourses = await Course.find();
        const userCourses = await UserCourse.find({ user_id: req.user.userId });
        
        const redeemedIds = userCourses.map(uc => uc.course_id.toString());
        
        const mapped = allCourses.map(c => {
            const isRedeemed = redeemedIds.includes(c._id.toString());
            return {
                ...c.toObject(),
                status: isRedeemed ? 'Accessible Now' : 'Locked'
            };
        });
        
        res.json(mapped);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch course status.' });
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



// =============================================
// ADMIN API ENDPOINTS
// =============================================
const adminOnly = (req, res, next) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
    next();
};

// --- USER MANAGEMENT ---

// GET all users (with skill data)
app.get('/api/admin/users', authenticateToken, adminOnly, async (req, res) => {
    try {
        const { search, role, sort } = req.query;
        let query = {};
        if (search) query.$or = [{ name: { $regex: search, $options: 'i' } }, { email: { $regex: search, $options: 'i' } }];
        if (role && role !== 'all') query.role = role;
        let sortObj = { createdAt: -1 };
        if (sort === 'name') sortObj = { name: 1 };
        if (sort === 'email') sortObj = { email: 1 };
        const users = await User.find(query).select('-password').sort(sortObj);
        // Attach skill grade summary
        const enriched = await Promise.all(users.map(async u => {
            const skills = await Skill.find({ user: u._id });
            const gradeMap = { A: 5, B: 4, C: 3, D: 2, E: 1 };
            const bestGrade = skills.length
                ? skills.reduce((best, s) => (gradeMap[s.skill_grade] > gradeMap[best] ? s.skill_grade : best), 'E')
                : 'N/A';
            return { ...u.toObject(), skillGrade: bestGrade, skillCount: skills.length };
        }));
        res.json(enriched);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch users.' });
    }
});

// GET single user
app.get('/api/admin/users/:id', authenticateToken, adminOnly, async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password');
        if (!user) return res.status(404).json({ error: 'User not found.' });
        const skills = await Skill.find({ user: req.params.id });
        res.json({ ...user.toObject(), skills });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch user.' });
    }
});

// PUT update user (role, name, email, status)
app.put('/api/admin/users/:id', authenticateToken, adminOnly, async (req, res) => {
    try {
        const { name, email, role, status } = req.body;
        const update = {};
        if (name) update.name = name;
        if (email) update.email = email;
        if (role) update.role = role;
        if (status !== undefined) update.status = status;
        const user = await User.findByIdAndUpdate(req.params.id, update, { new: true }).select('-password');
        if (!user) return res.status(404).json({ error: 'User not found.' });
        res.json({ message: 'User updated successfully.', user });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update user.' });
    }
});

// DELETE user
app.delete('/api/admin/users/:id', authenticateToken, adminOnly, async (req, res) => {
    try {
        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found.' });
        // cascade delete skills and wallet
        await Skill.deleteMany({ user: req.params.id });
        await Wallet.deleteOne({ user: req.params.id });
        res.json({ message: 'User deleted successfully.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete user.' });
    }
});

// PUT update user skill grade
app.put('/api/admin/users/:id/skill-grade', authenticateToken, adminOnly, async (req, res) => {
    try {
        const { skillId, newGrade } = req.body;
        const skill = await Skill.findById(skillId);
        if (!skill) return res.status(404).json({ error: 'Skill not found.' });
        const previousGrade = skill.skill_grade;
        skill.skill_grade = newGrade;
        await skill.save();
        await SkillValidation.create({
            userId: req.params.id,
            skillId,
            previousGrade,
            newGrade,
            validatedBy: req.user.userId
        });
        res.json({ message: 'Skill grade updated and history recorded.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update skill grade.' });
    }
});

// GET skill validation history for a user
app.get('/api/admin/users/:id/skill-history', authenticateToken, adminOnly, async (req, res) => {
    try {
        const history = await SkillValidation.find({ userId: req.params.id })
            .populate('skillId', 'skill_name')
            .populate('validatedBy', 'name')
            .sort({ validatedAt: -1 });
        res.json(history);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch skill history.' });
    }
});

// GET detailed analytics for a specific user
app.get('/api/admin/users/:id/detailed-stats', authenticateToken, adminOnly, async (req, res) => {
    try {
        const userId = req.params.id;
        const user = await User.findById(userId).select('-password');
        if (!user) return res.status(404).json({ error: 'User not found.' });

        const totalSwaps = await Trade.countDocuments({ $or: [{ requester: userId }, { receiver: userId }], status: 'completed' });
        const wallet = await Wallet.findOne({ user: userId });
        const totalChats = await ChatMessage.countDocuments({ $or: [{ sender_id: userId }, { receiver_id: userId }] });
        const totalCourses = await UserCourse.countDocuments({ user_id: userId });
        
        const firstSwap = await Trade.findOne({ $or: [{ requester: userId }, { receiver: userId }], status: 'completed' }).sort({ createdAt: 1 });
        
        const activityLogs = await ActivityLog.find({ user_id: userId }).sort({ created_at: -1 }).limit(50);

        // Timeline data for charts
        const swapTimeline = await Trade.aggregate([
            { $match: { $or: [{ requester: mongoose.Types.ObjectId(userId) }, { receiver: mongoose.Types.ObjectId(userId) }], status: 'completed' } },
            { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]);

        const coinsTimeline = await CoinTransaction.aggregate([
            { $match: { receiver_id: mongoose.Types.ObjectId(userId) } },
            { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$created_at" } }, earned: { $sum: "$amount" } } },
            { $sort: { _id: 1 } }
        ]);

        const spentTimeline = await CoinTransaction.aggregate([
            { $match: { sender_id: mongoose.Types.ObjectId(userId) } },
            { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$created_at" } }, spent: { $sum: "$amount" } } },
            { $sort: { _id: 1 } }
        ]);

        res.json({
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                joinDate: user.createdAt,
                totalSwaps,
                coinsEarned: wallet ? wallet.earned_coins : 0,
                coinsSpent: wallet ? wallet.used_coins : 0,
                totalChats,
                coursesRedeemed: totalCourses,
                firstSwapDate: firstSwap ? firstSwap.createdAt : 'N/A'
            },
            activityLogs,
            charts: {
                swapTimeline,
                coinsEarned: coinsTimeline,
                coinsSpent: spentTimeline
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch user detailed stats.' });
    }
});

// --- COURSE MANAGEMENT ---

// GET all courses
app.get('/api/admin/courses', authenticateToken, adminOnly, async (req, res) => {
    try {
        const courses = await Course.find().sort({ createdAt: -1 });
        res.json(courses);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch courses.' });
    }
});

// POST create course
app.post('/api/admin/courses', authenticateToken, adminOnly, async (req, res) => {
    try {
        const { course_name, description, coin_price, category, instructor } = req.body;
        await Course.create({ course_name, description, coin_price, category, instructor });
        res.status(201).json({ message: 'Course created successfully!' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create course.' });
    }
});

// PUT update course
app.put('/api/admin/courses/:id', authenticateToken, adminOnly, async (req, res) => {
    try {
        const { course_name, description, coin_price, category, instructor } = req.body;
        const course = await Course.findByIdAndUpdate(
            req.params.id,
            { course_name, description, coin_price, category, instructor },
            { new: true }
        );
        if (!course) return res.status(404).json({ error: 'Course not found.' });
        res.json({ message: 'Course updated successfully.', course });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update course.' });
    }
});

// DELETE course
app.delete('/api/admin/courses/:id', authenticateToken, adminOnly, async (req, res) => {
    try {
        const course = await Course.findByIdAndDelete(req.params.id);
        if (!course) return res.status(404).json({ error: 'Course not found.' });
        res.json({ message: 'Course deleted successfully.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete course.' });
    }
});

// --- SKILL VALIDATION (legacy route, kept for compatibility) ---
app.put('/api/admin/skills/:id/validate', authenticateToken, adminOnly, async (req, res) => {
    try {
        const skillId = req.params.id;
        const { new_grade } = req.body;
        const skill = await Skill.findById(skillId);
        if (!skill) return res.status(404).json({ error: 'Skill not found.' });
        const previousGrade = skill.skill_grade;
        skill.skill_grade = new_grade;
        await skill.save();
        await SkillValidation.create({
            userId: skill.user,
            skillId,
            previousGrade,
            newGrade: new_grade,
            validatedBy: req.user.userId
        });
        res.json({ message: 'Skill validated and grade updated.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to validate skill.' });
    }
});

// GET all skills (for skill validation panel)
app.get('/api/admin/skills', authenticateToken, adminOnly, async (req, res) => {
    try {
        const { search, grade } = req.query;
        let query = {};
        if (search) query.skill_name = { $regex: search, $options: 'i' };
        if (grade && grade !== 'all') query.skill_grade = grade;
        const skills = await Skill.find(query)
            .populate('user', 'name email')
            .sort({ skill_name: 1 });
        res.json(skills);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch skills.' });
    }
});

// GET all trades for admin
app.get('/api/admin/trades', authenticateToken, adminOnly, async (req, res) => {
    try {
        const trades = await Trade.find()
            .populate('requester', 'name email')
            .populate('receiver', 'name email')
            .sort({ createdAt: -1 });
        res.json(trades);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch all trades.' });
    }
});

// --- ANALYTICS OVERVIEW ---
app.get('/api/admin/analytics/overview', authenticateToken, adminOnly, async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const totalCourses = await Course.countDocuments();
        const totalTrades = await Trade.countDocuments();
        const completedTrades = await Trade.countDocuments({ status: 'completed' });
        const pendingTrades = await Trade.countDocuments({ status: 'pending' });

        // Grade distribution across all skills
        const gradeAgg = await Skill.aggregate([
            { $group: { _id: '$skill_grade', count: { $sum: 1 } } }
        ]);
        const gradeDistribution = { A: 0, B: 0, C: 0, D: 0, E: 0 };
        gradeAgg.forEach(g => { if (g._id) gradeDistribution[g._id] = g.count; });

        // Role distribution
        const roleAgg = await User.aggregate([
            { $group: { _id: '$role', count: { $sum: 1 } } }
        ]);
        const roleDistribution = {};
        roleAgg.forEach(r => { roleDistribution[r._id || 'unknown'] = r.count; });

        // Trade status distribution
        const tradeStatusAgg = await Trade.aggregate([
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]);
        const tradeStatus = {};
        tradeStatusAgg.forEach(t => { tradeStatus[t._id] = t.count; });

        // User growth - last 7 months
        const now = new Date();
        const userGrowth = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
            const count = await User.countDocuments({ createdAt: { $gte: d, $lt: end } });
            userGrowth.push({
                month: d.toLocaleString('default', { month: 'short', year: '2-digit' }),
                count
            });
        }

        // Trade activity - last 7 months
        const tradeActivity = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
            const count = await Trade.countDocuments({ createdAt: { $gte: d, $lt: end } });
            tradeActivity.push({
                month: d.toLocaleString('default', { month: 'short', year: '2-digit' }),
                count
            });
        }

        // Top skills
        const topSkills = await Skill.aggregate([
            { $group: { _id: '$skill_name', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 5 }
        ]);

        res.json({
            totalUsers,
            totalCourses,
            totalTrades,
            completedTrades,
            pendingTrades,
            gradeDistribution,
            roleDistribution,
            tradeStatus,
            userGrowth,
            tradeActivity,
            topSkills
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch analytics.' });
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

// Auto-seed a default Admin user if none exists
async function seedAdmin() {
    try {
        const adminCount = await User.countDocuments({ role: 'admin' });
        if (adminCount === 0) {
            const hashedPassword = await bcrypt.hash('admin123', 10);
            await User.create({
                name: 'System Admin',
                email: 'admin@nexus.com',
                password: hashedPassword,
                phone: '000-000-0000',
                role: 'admin',
                status: 'active'
            });
            console.log('✅ Created default Admin account: admin@nexus.com | password: admin123');
        }
    } catch (err) {
        console.error('Failed to seed admin:', err);
    }
}

seedCourses();
seedAdmin();
