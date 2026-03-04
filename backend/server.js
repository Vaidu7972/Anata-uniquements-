require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from the frontend folder
app.use(express.static(path.join(__dirname, '../frontend')));

// Database connection wrapper (Mocking mysql2 Pool)
let dbPromise = open({
    filename: './database.sqlite',
    driver: sqlite3.Database
}).then(async (db) => {
    // initialize schema
    await db.exec(`
        CREATE TABLE IF NOT EXISTS Users (
            user_id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            email TEXT UNIQUE,
            phone TEXT,
            password TEXT,
            role TEXT DEFAULT 'user',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS Wallet (
            wallet_id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            total_coins INTEGER DEFAULT 0,
            earned_coins INTEGER DEFAULT 0,
            used_coins INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS Skills (
            skill_id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            skill_name TEXT,
            skill_type TEXT,
            skill_grade TEXT
        );
        CREATE TABLE IF NOT EXISTS Trades (
            trade_id INTEGER PRIMARY KEY AUTOINCREMENT,
            requester_id INTEGER,
            receiver_id INTEGER,
            skills_exchanged TEXT,
            status TEXT DEFAULT 'pending',
            duration_days INTEGER,
            satisfaction TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS Courses (
            course_id INTEGER PRIMARY KEY AUTOINCREMENT,
            course_name TEXT,
            description TEXT,
            coin_price INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS Reviews (
            review_id INTEGER PRIMARY KEY AUTOINCREMENT,
            trade_id INTEGER,
            reviewer_id INTEGER,
            rating INTEGER,
            comment TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS Messages (
            message_id INTEGER PRIMARY KEY AUTOINCREMENT,
            trade_id INTEGER,
            sender_id INTEGER,
            message_text TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Seed test courses if empty
    const courses = await db.all('SELECT * FROM Courses LIMIT 1');
    if (courses.length === 0) {
        await db.run('INSERT INTO Courses (course_name, description, coin_price) VALUES (?, ?, ?)', ['Web Development Masterclass', 'Learn from scratch', 50]);
        await db.run('INSERT INTO Courses (course_name, description, coin_price) VALUES (?, ?, ?)', ['AI Fundamentals', 'Basics of AI algorithms', 100]);
        await db.run('INSERT INTO Courses (course_name, description, coin_price) VALUES (?, ?, ?)', ['Graphic Design 101', 'Intro to visual design', 30]);
        await db.run('INSERT INTO Courses (course_name, description, coin_price) VALUES (?, ?, ?)', ['Data Structures & Alg', 'Deep dive into algos', 150]);
    }

    return db;
});

const pool = {
    query: async (sql, params = []) => {
        const db = await dbPromise;
        let newSql = sql;
        let newParams = params;

        // Handle IN (?) for skills matching
        if (newSql.includes('IN (?)') && newParams.length > 0) {
            const arrIndex = newParams.findIndex(p => Array.isArray(p));
            if (arrIndex !== -1) {
                const arr = newParams[arrIndex];
                newSql = newSql.replace('IN (?)', `IN (${arr.map(() => '?').join(',')})`);
                newParams = [
                    ...newParams.slice(0, arrIndex),
                    ...arr,
                    ...newParams.slice(arrIndex + 1)
                ];
            }
        }

        if (newSql.trim().toUpperCase().startsWith('SELECT')) {
            const rows = await db.all(newSql, newParams);
            return [rows];
        } else {
            try {
                const result = await db.run(newSql, newParams);
                return [{
                    insertId: result.lastID,
                    affectedRows: result.changes
                }];
            } catch (err) {
                if (err.message && err.message.includes('UNIQUE')) {
                    err.code = 'ER_DUP_ENTRY';
                }
                throw err;
            }
        }
    }
};

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

// ==========================================
// 1. USER APIs
// ==========================================

// Register User
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, phone, password, role } = req.body;

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert into Users table
        const [result] = await pool.query(
            'INSERT INTO Users (name, email, phone, password, role) VALUES (?, ?, ?, ?, ?)',
            [name, email, phone, hashedPassword, role || 'user']
        );

        const userId = result.insertId;

        // Initialize user wallet
        await pool.query('INSERT INTO Wallet (user_id, total_coins, earned_coins, used_coins) VALUES (?, 0, 0, 0)', [userId]);

        res.status(201).json({ message: 'User registered successfully!', userId: userId });
    } catch (err) {
        console.error(err);
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'Email already exists!' });
        }
        res.status(500).json({ error: 'Failed to register user.' });
    }
});

// Login User
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const [users] = await pool.query('SELECT * FROM Users WHERE email = ?', [email]);
        if (users.length === 0) return res.status(404).json({ message: 'User not found!' });

        const user = users[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ message: 'Invalid credentials!' });

        // Generate Token
        // NOTE: we sign `id` to match the frontend expects `data.user.id` or we map it
        const token = jwt.sign({ userId: user.user_id, role: user.role }, JWT_SECRET, { expiresIn: '24h' });

        res.json({ message: 'Login successful!', token, user: { id: user.user_id, name: user.name, role: user.role } });
    } catch (err) {
        res.status(500).json({ error: 'Login failed.' });
    }
});

// Get Profile
app.get('/api/profile', authenticateToken, async (req, res) => {
    try {
        const [users] = await pool.query('SELECT user_id, name, email, phone, role FROM Users WHERE user_id = ?', [req.user.userId]);
        const [skills] = await pool.query('SELECT * FROM Skills WHERE user_id = ?', [req.user.userId]);

        if (users.length === 0) return res.status(404).json({ message: 'User not found' });

        res.json({ user: users[0], skills });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch profile.' });
    }
});

// ==========================================
// 2. SKILL APIs
// ==========================================

// Add Skill
app.post('/api/skills', authenticateToken, async (req, res) => {
    try {
        const { skill_name, skill_type, skill_grade } = req.body;
        await pool.query(
            'INSERT INTO Skills (user_id, skill_name, skill_type, skill_grade) VALUES (?, ?, ?, ?)',
            [req.user.userId, skill_name, skill_type, skill_grade]
        );
        res.status(201).json({ message: 'Skill added successfully!' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to add skill.' });
    }
});

// Get User Skills
app.get('/api/skills', authenticateToken, async (req, res) => {
    try {
        const [skills] = await pool.query('SELECT * FROM Skills WHERE user_id = ?', [req.user.userId]);
        res.json(skills);
    } catch (err) {
        res.status(500).json({ error: 'Failed to get skills.' });
    }
});

// ==========================================
// 3. MATCHING API & LOGIC
// ==========================================

// AI Matching Logic
app.get('/api/matches', authenticateToken, async (req, res) => {
    try {
        // 1. Find what skills the current user requires
        const [requiredSkills] = await pool.query(
            'SELECT skill_name, skill_grade FROM Skills WHERE user_id = ? AND skill_type = "required"',
            [req.user.userId]
        );

        if (requiredSkills.length === 0) {
            return res.json({ message: 'Please add required skills to find matches.', matches: [] });
        }

        // 2. Fetch all offered skills from other users to perform "AI" matching
        const [allOffered] = await pool.query(
            `SELECT u.user_id, u.name, s.skill_name, s.skill_grade 
             FROM Skills s 
             JOIN Users u ON s.user_id = u.user_id 
             WHERE s.skill_type = "offered" 
             AND s.user_id != ?`,
            [req.user.userId]
        );

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
        const processedUsers = new Set();

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

            if (bestScore >= 30) { // Threshold for "AI" matching
                matches.push({
                    user_id: offered.user_id,
                    name: offered.name,
                    skill_name: offered.skill_name,
                    skill_grade: offered.skill_grade,
                    matched_on: matchedOn,
                    score: bestScore,
                    match_type: bestScore >= 85 ? 'Neural Sync (High)' : (bestScore >= 60 ? 'Optimal Match' : 'Approx Match')
                });
            }
        });

        // Sort by score
        matches.sort((a, b) => b.score - a.score);

        res.json({ matches: matches.slice(0, 12) }); // Return top 12 matches

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Matching algorithm failed.' });
    }
});

// ==========================================
// 4. TRADE APIs
// ==========================================

// Create Trade Request
app.post('/api/trades', authenticateToken, async (req, res) => {
    try {
        const { receiver_id, skills_exchanged } = req.body;
        await pool.query(
            'INSERT INTO Trades (requester_id, receiver_id, skills_exchanged, status) VALUES (?, ?, ?, "pending")',
            [req.user.userId, receiver_id, skills_exchanged]
        );
        res.status(201).json({ message: 'Trade request sent!' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to send trade request.' });
    }
});

// Get Trades for user
app.get('/api/trades', authenticateToken, async (req, res) => {
    try {
        const [trades] = await pool.query(
            `SELECT t.trade_id as _id, t.trade_id, t.requester_id, t.receiver_id, t.skills_exchanged, t.status, t.duration_days, t.satisfaction,
                    u_req.name as requester_name, u_rec.name as receiver_name 
             FROM Trades t
             JOIN Users u_req ON t.requester_id = u_req.user_id
             JOIN Users u_rec ON t.receiver_id = u_rec.user_id
             WHERE t.requester_id = ? OR t.receiver_id = ?
                    ORDER BY t.created_at DESC`,
            [req.user.userId, req.user.userId]
        );
        res.json(trades);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch trades.' });
    }
});

// Accept Trade
app.put('/api/trades/:id/accept', authenticateToken, async (req, res) => {
    try {
        const tradeId = req.params.id;
        const [result] = await pool.query(
            'UPDATE Trades SET status = "accepted" WHERE trade_id = ? AND receiver_id = ? AND status = "pending"',
            [tradeId, req.user.userId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Trade not found or unauthorized' });
        }

        res.json({ message: 'Trade accepted!' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to accept trade.' });
    }
});

// Reject Trade
app.put('/api/trades/:id/reject', authenticateToken, async (req, res) => {
    try {
        const tradeId = req.params.id;
        const [result] = await pool.query(
            'UPDATE Trades SET status = "rejected" WHERE trade_id = ? AND receiver_id = ? AND status = "pending"',
            [tradeId, req.user.userId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Trade not found or unauthorized' });
        }

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

        const [updateResult] = await pool.query(
            'UPDATE Trades SET status = "completed", duration_days = ?, satisfaction = ? WHERE trade_id = ? AND status = "accepted"',
            [duration_days || 1, satisfaction || 'Average', tradeId]
        );

        if (updateResult.affectedRows === 0) {
            return res.status(400).json({ error: 'Trade cannot be completed. It might not be accepted yet or already completed.' });
        }

        const [trades] = await pool.query('SELECT requester_id, receiver_id FROM Trades WHERE trade_id = ?', [tradeId]);
        if (trades.length > 0) {
            const t = trades[0];
            await pool.query('UPDATE Wallet SET total_coins = total_coins + ?, earned_coins = earned_coins + ? WHERE user_id IN (?, ?)',
                [totalAwarded, totalAwarded, t.requester_id, t.receiver_id]);
        }

        res.json({ message: 'Trade completed and coins awarded!', coinsAwared: totalAwarded });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to complete trade.' });
    }
});

// ==========================================
// 5. REVIEW APIs
// ==========================================

// Add Review after Trade
app.post('/api/reviews', authenticateToken, async (req, res) => {
    try {
        const { trade_id, rating, comment } = req.body;

        // Ensure trade was completed
        const [trades] = await pool.query('SELECT status FROM Trades WHERE trade_id = ?', [trade_id]);
        if (trades.length === 0 || trades[0].status !== 'completed') {
            return res.status(400).json({ error: 'Trade must be completed before leaving a review.' });
        }

        await pool.query(
            'INSERT INTO Reviews (trade_id, reviewer_id, rating, comment) VALUES (?, ?, ?, ?)',
            [trade_id, req.user.userId, rating, comment]
        );
        res.status(201).json({ message: 'Review added successfully!' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to add review.' });
    }
});

// ==========================================
// 5.5 CHAT MESSENGER APIs
// ==========================================

// Send Message
app.post('/api/messages', authenticateToken, async (req, res) => {
    try {
        const { trade_id, message_text } = req.body;

        // Verify user is part of this trade
        const [trades] = await pool.query('SELECT requester_id, receiver_id FROM Trades WHERE trade_id = ?', [trade_id]);
        if (trades.length === 0) return res.status(404).json({ error: 'Trade not found.' });

        const trade = trades[0];
        if (trade.requester_id !== req.user.userId && trade.receiver_id !== req.user.userId) {
            return res.status(403).json({ error: 'Unauthorized to chat in this trade.' });
        }

        await pool.query(
            'INSERT INTO Messages (trade_id, sender_id, message_text) VALUES (?, ?, ?)',
            [trade_id, req.user.userId, message_text]
        );

        res.status(201).json({ message: 'Message sent!' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to transmit message.' });
    }
});

// Get Messages
app.get('/api/messages/:tradeId', authenticateToken, async (req, res) => {
    try {
        const tradeId = req.params.tradeId;

        // Verify user is part of this trade
        const [trades] = await pool.query('SELECT requester_id, receiver_id FROM Trades WHERE trade_id = ?', [tradeId]);
        if (trades.length === 0) return res.status(404).json({ error: 'Trade not found.' });

        const trade = trades[0];
        if (trade.requester_id !== req.user.userId && trade.receiver_id !== req.user.userId) {
            return res.status(403).json({ error: 'Unauthorized.' });
        }

        const [messages] = await pool.query(
            `SELECT m.*, u.name as sender_name 
             FROM Messages m 
             JOIN Users u ON m.sender_id = u.user_id 
             WHERE m.trade_id = ? 
             ORDER BY m.created_at ASC`,
            [tradeId]
        );

        res.json(messages);
    } catch (err) {
        res.status(500).json({ error: 'Failed to retrieve messages.' });
    }
});

// ==========================================
// 6. WALLET APIs
// ==========================================

// Get Coins
app.get('/api/wallet', authenticateToken, async (req, res) => {
    try {
        const [wallets] = await pool.query('SELECT * FROM Wallet WHERE user_id = ?', [req.user.userId]);
        if (wallets.length === 0) return res.status(404).json({ message: 'Wallet not found' });
        res.json(wallets[0]);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch wallet info.' });
    }
});

// ==========================================
// 6. COURSE APIs
// ==========================================

// Get Courses
app.get('/api/courses', async (req, res) => {
    try {
        const [courses] = await pool.query('SELECT course_id as _id, course_id, course_name, description, coin_price FROM Courses ORDER BY created_at DESC');
        res.json(courses);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch courses.' });
    }
});

// Buy Course
app.post('/api/courses/:id/buy', authenticateToken, async (req, res) => {
    try {
        const courseId = req.params.id;

        const [courses] = await pool.query('SELECT coin_price, course_name FROM Courses WHERE course_id = ?', [courseId]);
        if (courses.length === 0) return res.status(404).json({ error: 'Course not found' });

        const price = courses[0].coin_price;

        const [wallets] = await pool.query('SELECT total_coins FROM Wallet WHERE user_id = ?', [req.user.userId]);
        const balance = wallets[0].total_coins;

        if (balance < price) {
            return res.status(400).json({ error: 'Insufficient virtual coins to buy this course.' });
        }

        await pool.query('UPDATE Wallet SET total_coins = total_coins - ?, used_coins = used_coins + ? WHERE user_id = ?',
            [price, price, req.user.userId]);

        res.json({ message: `Successfully purchased ${courses[0].course_name}!` });
    } catch (err) {
        res.status(500).json({ error: 'Failed to buy course.' });
    }
});

// ==========================================
// 8. DISCOVERY APIs
// ==========================================

// Discover all nodes (users)
app.get('/api/users/discover', authenticateToken, async (req, res) => {
    try {
        const [users] = await pool.query(
            `SELECT u.user_id, u.name, u.role, 
                    GROUP_CONCAT(s.skill_name) as skills
             FROM Users u 
             LEFT JOIN Skills s ON u.user_id = s.user_id AND s.skill_type = "offered"
             WHERE u.user_id != ?
             GROUP BY u.user_id
             LIMIT 20`,
            [req.user.userId]
        );
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: 'Discovery failed.' });
    }
});

// ==========================================
// 7. ADMIN APIs
// ==========================================

app.get('/api/admin/users', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
    try {
        const [users] = await pool.query('SELECT user_id as _id, name, email, role, created_at FROM Users');
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch users.' });
    }
});

app.post('/api/admin/courses', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
    try {
        const { course_name, description, coin_price } = req.body;
        await pool.query('INSERT INTO Courses (course_name, description, coin_price) VALUES (?, ?, ?)', [course_name, description, coin_price]);
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
        await pool.query('UPDATE Skills SET skill_grade = ? WHERE skill_id = ?', [new_grade, skillId]);
        res.json({ message: 'Skill validated and grade updated.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to validate skill.' });
    }
});

app.get('/api/admin/trades', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
    try {
        const [trades] = await pool.query('SELECT * FROM Trades ORDER BY created_at DESC');
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
        const [users] = await pool.query('SELECT user_id FROM Users WHERE email = ?', [email]);
        if (users.length === 0) {
            return res.status(404).json({ error: 'No account found with this email address.' });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update password
        await pool.query('UPDATE Users SET password = ? WHERE email = ?', [hashedPassword, email]);

        res.json({ message: 'Password reset successfully!' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to reset password.' });
    }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Ananta Techtonic API Server is running on port ${PORT} (Database Connected)`);
});
