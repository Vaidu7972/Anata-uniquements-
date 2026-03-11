/**
 * seed-users.js — Ananta Techtonic Advanced Test Data Seeder
 * Run: node seed-users.js
 *
 * Creates 25+ test users, simulated swaps, encrypted chats, 
 * achievements, courses, and detailed activity logs.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const User = require('./models/User');
const Skill = require('./models/Skill');
const Wallet = require('./models/Wallet');
const Trade = require('./models/Trade');
const Course = require('./models/Course');
const ActivityLog = require('./models/ActivityLog');
const ChatMessage = require('./models/ChatMessage');
const UserAchievement = require('./models/UserAchievement');
const CoinTransaction = require('./models/CoinTransaction');
const UserCourse = require('./models/UserCourse');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || '';
const ENCRYPTION_KEY = (process.env.ENCRYPTION_KEY || 'ananta_techtonic_secret_32bytes_!!').substring(0, 32).padEnd(32, '0');
const IV_LENGTH = 16;

function encrypt(text) {
    let iv = crypto.randomBytes(IV_LENGTH);
    let cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

const TEST_PASSWORD = 'Test@1234';

async function seed() {
    console.log('🚀 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI, { dbName: process.env.MONGO_DB || undefined });
    console.log('✅ Connected.\n');

    // Clear existing data (optional, but good for a fresh seed)
    // await User.deleteMany({ email: /testuser|nexus.com/ });
    
    const hashedPassword = await bcrypt.hash(TEST_PASSWORD, 10);

    console.log('👤 Seeding 25+ test users...');
    const users = [];
    for (let i = 1; i <= 25; i++) {
        const email = `testuser${i}@ananta.com`;
        let user = await User.findOne({ email });
        if (!user) {
            user = await User.create({
                name: `Test User ${i}`,
                email,
                password: hashedPassword,
                phone: `+1-555-0${100 + i}`,
                role: 'user',
                status: 'active',
                createdAt: new Date(Date.now() - Math.floor(Math.random() * 60) * 24 * 60 * 60 * 1000) // Random join date in last 60 days
            });
            console.log(`   ➕ Created: ${email}`);
        }
        users.push(user);
    }

    // Ensure Wallets
    console.log('💰 Ensuring wallets...');
    for (const user of users) {
        let wallet = await Wallet.findOne({ user: user._id });
        if (!wallet) {
            await Wallet.create({
                user: user._id,
                total_coins: 100 + Math.floor(Math.random() * 500),
                earned_coins: 200 + Math.floor(Math.random() * 800),
                used_coins: Math.floor(Math.random() * 300)
            });
        }
    }

    // Create Courses
    console.log('📚 Ensuring courses...');
    const courses = await Course.find();
    if (courses.length < 5) {
        await Course.create([
            { course_name: 'Advanced React Patterns', description: 'Master React performance', coin_price: 150, category: 'Development' },
            { course_name: 'Python for Data Science', description: 'Pandas, Numpy and more', coin_price: 120, category: 'Data Science' },
            { course_name: 'UI Design Theory', description: 'Color, Typography & Grid', coin_price: 80, category: 'Design' },
            { course_name: 'Node.js Backend Architecture', description: 'Clean code in Node', coin_price: 200, category: 'Development' },
            { course_name: 'Blockchain Fundamentals', description: 'How crypto works', coin_price: 250, category: 'Crypto' }
        ]);
    }
    const allCourses = await Course.find();

    // Generate Activity Log actions
    const actions = ['login', 'swap', 'coin transfer', 'chat message', 'course redemption'];

    console.log('🔄 Generating simulated activity...');
    for (const user of users) {
        // 1. Generate Activity Logs
        const logCount = 5 + Math.floor(Math.random() * 15);
        for (let j = 0; j < logCount; j++) {
            await ActivityLog.create({
                user_id: user._id,
                action_type: actions[Math.floor(Math.random() * actions.length)],
                description: `Simulated activity #${j} for demonstration`,
                created_at: new Date(Date.now() - Math.floor(Math.random() * 30) * 24 * 60 * 60 * 1000)
            });
        }

        // 2. Generate Swaps (Trades)
        const swapCount = 3 + Math.floor(Math.random() * 7);
        for (let k = 0; k < swapCount; k++) {
            const partner = users[Math.floor(Math.random() * users.length)];
            if (partner._id.toString() === user._id.toString()) continue;

            const isCompleted = Math.random() > 0.3;
            const tradeDate = new Date(Date.now() - Math.floor(Math.random() * 45) * 24 * 60 * 60 * 1000);
            
            const tradeData = {
                requester: user._id,
                receiver: partner._id,
                skills_exchanged: 'Simulated Skill ↔ Partner Skill',
                status: isCompleted ? 'completed' : 'pending',
                createdAt: tradeDate
            };

            if (isCompleted) {
                tradeData.duration_days = 2 + Math.floor(Math.random() * 10);
                tradeData.satisfaction = ['Excellent', 'Good', 'Average'][Math.floor(Math.random() * 3)];
            }

            const trade = await Trade.create(tradeData);

            if (isCompleted) {
                // Add coin transaction for completion
                const reward = 25 + Math.floor(Math.random() * 50);
                await CoinTransaction.create({
                    receiver_id: user._id,
                    amount: reward,
                    transaction_type: 'swap_reward',
                    reference_id: trade._id,
                    created_at: tradeDate
                });
                await CoinTransaction.create({
                    receiver_id: partner._id,
                    amount: reward,
                    transaction_type: 'swap_reward',
                    reference_id: trade._id,
                    created_at: tradeDate
                });

                // First swap achievement
                const existingAchievement = await UserAchievement.findOne({ user_id: user._id, achievement_type: 'First Successful Exchange' });
                if (!existingAchievement) {
                    await UserAchievement.create({
                        user_id: user._id,
                        achievement_type: 'First Successful Exchange',
                        description: 'Completed your first swap on Anata Techtonic',
                        created_at: tradeDate
                    });
                }
            }
        }

        // 3. Generate Chats
        const chatCount = 5 + Math.floor(Math.random() * 20);
        for (let l = 0; l < chatCount; l++) {
            const partner = users[Math.floor(Math.random() * users.length)];
            const msg = `This is a secure message ${l} from ${user.name}`;
            await ChatMessage.create({
                sender_id: user._id,
                receiver_id: partner._id,
                encrypted_message: encrypt(msg),
                created_at: new Date(Date.now() - Math.floor(Math.random() * 15) * 24 * 60 * 60 * 1000)
            });
        }

        // 4. Course Redemptions
        const courseCount = 1 + Math.floor(Math.random() * 3);
        for (let m = 0; m < courseCount; m++) {
            const course = allCourses[Math.floor(Math.random() * allCourses.length)];
            const existing = await UserCourse.findOne({ user_id: user._id, course_id: course._id });
            if (!existing) {
                const redeemDate = new Date(Date.now() - Math.floor(Math.random() * 20) * 24 * 60 * 60 * 1000);
                await UserCourse.create({
                    user_id: user._id,
                    course_id: course._id,
                    redeemed_at: redeemDate,
                    access_status: 'Accessible Now'
                });
                await CoinTransaction.create({
                    sender_id: user._id,
                    receiver_id: null,
                    amount: course.coin_price,
                    transaction_type: 'course_purchase',
                    reference_id: course._id,
                    created_at: redeemDate
                });
                await ActivityLog.create({
                    user_id: user._id,
                    action_type: 'course redemption',
                    description: `Redeemed course: ${course.course_name}`,
                    created_at: redeemDate
                });
            }
        }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 Seeding complete with advanced data!');
    console.log('   Users Created: 25');
    console.log('   Simulated activity across all models.');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await mongoose.disconnect();
    process.exit(0);
}

seed().catch(err => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
});
