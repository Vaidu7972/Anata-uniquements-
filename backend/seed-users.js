/**
 * seed-users.js — Ananta Techtonic Test Data Seeder
 * Run: node seed-users.js
 *
 * Creates 20 realistic test users + skills + wallets + sample trades
 * Password for ALL seeded users: Test@1234
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const User = require('./models/User');
const Skill = require('./models/Skill');
const Wallet = require('./models/Wallet');
const Trade = require('./models/Trade');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || '';
if (!MONGO_URI) {
    console.error('❌  MONGO_URI not set in .env — aborting.');
    process.exit(1);
}

// ─────────────────────────────────────────────
//  TEST USER DEFINITIONS
// ─────────────────────────────────────────────
const TEST_PASSWORD = 'Test@1234';

const TEST_USERS = [
    // ── Admins ──────────────────────────────
    { name: 'Nova Admin', email: 'nova.admin@nexus.com', role: 'admin', status: 'active', phone: '+1-555-0101' },
    { name: 'Rex Override', email: 'rex.override@nexus.com', role: 'admin', status: 'active', phone: '+1-555-0102' },

    // ── Instructors ─────────────────────────
    { name: 'Dr. Aria Flux', email: 'aria.flux@nexus.com', role: 'instructor', status: 'active', phone: '+1-555-0201' },
    { name: 'Prof. Zane Kira', email: 'zane.kira@nexus.com', role: 'instructor', status: 'active', phone: '+1-555-0202' },
    { name: 'Cleo Sigma', email: 'cleo.sigma@nexus.com', role: 'instructor', status: 'inactive', phone: '+1-555-0203' },

    // ── Regular Users (Active) ───────────────
    { name: 'Ethan Byte', email: 'ethan.byte@nexus.com', role: 'user', status: 'active', phone: '+1-555-0301' },
    { name: 'Jade Cipher', email: 'jade.cipher@nexus.com', role: 'user', status: 'active', phone: '+1-555-0302' },
    { name: 'Marcus Vector', email: 'marcus.vector@nexus.com', role: 'user', status: 'active', phone: '+1-555-0303' },
    { name: 'Lyra Pixel', email: 'lyra.pixel@nexus.com', role: 'user', status: 'active', phone: '+1-555-0304' },
    { name: 'Orion Kernel', email: 'orion.kernel@nexus.com', role: 'user', status: 'active', phone: '+1-555-0305' },
    { name: 'Sable Nyx', email: 'sable.nyx@nexus.com', role: 'user', status: 'active', phone: '+1-555-0306' },
    { name: 'Atlas Codex', email: 'atlas.codex@nexus.com', role: 'user', status: 'active', phone: '+1-555-0307' },
    { name: 'Vera Synth', email: 'vera.synth@nexus.com', role: 'user', status: 'active', phone: '+1-555-0308' },
    { name: 'Remy Stack', email: 'remy.stack@nexus.com', role: 'user', status: 'active', phone: '+1-555-0309' },
    { name: 'Cass Circuit', email: 'cass.circuit@nexus.com', role: 'user', status: 'active', phone: '+1-555-0310' },
    { name: 'Flynn Tensor', email: 'flynn.tensor@nexus.com', role: 'user', status: 'active', phone: '+1-555-0311' },
    { name: 'Iris Protocol', email: 'iris.protocol@nexus.com', role: 'user', status: 'active', phone: '+1-555-0312' },

    // ── Regular Users (Inactive) ─────────────
    { name: 'Dex Null', email: 'dex.null@nexus.com', role: 'user', status: 'inactive', phone: '+1-555-0401' },
    { name: 'Lena Limbo', email: 'lena.limbo@nexus.com', role: 'user', status: 'inactive', phone: '+1-555-0402' },
    { name: 'Vex Deprecated', email: 'vex.deprecated@nexus.com', role: 'user', status: 'inactive', phone: '+1-555-0403' },
];

// Skills to assign per user [email → array of {skill_name, skill_type, skill_grade}]
const USER_SKILLS = {
    'ethan.byte@nexus.com': [
        { skill_name: 'React.js', skill_type: 'offered', skill_grade: 'A' },
        { skill_name: 'Node.js', skill_type: 'offered', skill_grade: 'B' },
        { skill_name: 'Machine Learning', skill_type: 'required', skill_grade: 'C' },
    ],
    'jade.cipher@nexus.com': [
        { skill_name: 'Python', skill_type: 'offered', skill_grade: 'A' },
        { skill_name: 'Data Science', skill_type: 'offered', skill_grade: 'B' },
        { skill_name: 'Web Development', skill_type: 'required', skill_grade: 'B' },
    ],
    'marcus.vector@nexus.com': [
        { skill_name: 'UI/UX Design', skill_type: 'offered', skill_grade: 'A' },
        { skill_name: 'Figma', skill_type: 'offered', skill_grade: 'A' },
        { skill_name: 'Python', skill_type: 'required', skill_grade: 'C' },
    ],
    'lyra.pixel@nexus.com': [
        { skill_name: 'Graphic Design', skill_type: 'offered', skill_grade: 'B' },
        { skill_name: 'Adobe XD', skill_type: 'offered', skill_grade: 'B' },
        { skill_name: 'React.js', skill_type: 'required', skill_grade: 'A' },
    ],
    'orion.kernel@nexus.com': [
        { skill_name: 'DevOps', skill_type: 'offered', skill_grade: 'A' },
        { skill_name: 'Docker', skill_type: 'offered', skill_grade: 'A' },
        { skill_name: 'Kubernetes', skill_type: 'offered', skill_grade: 'B' },
        { skill_name: 'UI/UX Design', skill_type: 'required', skill_grade: 'C' },
    ],
    'sable.nyx@nexus.com': [
        { skill_name: 'Cybersecurity', skill_type: 'offered', skill_grade: 'A' },
        { skill_name: 'Penetration Testing', skill_type: 'offered', skill_grade: 'A' },
        { skill_name: 'Node.js', skill_type: 'required', skill_grade: 'B' },
    ],
    'atlas.codex@nexus.com': [
        { skill_name: 'Blockchain', skill_type: 'offered', skill_grade: 'B' },
        { skill_name: 'Solidity', skill_type: 'offered', skill_grade: 'C' },
        { skill_name: 'DevOps', skill_type: 'required', skill_grade: 'A' },
    ],
    'vera.synth@nexus.com': [
        { skill_name: 'Machine Learning', skill_type: 'offered', skill_grade: 'A' },
        { skill_name: 'TensorFlow', skill_type: 'offered', skill_grade: 'A' },
        { skill_name: 'Data Science', skill_type: 'offered', skill_grade: 'B' },
        { skill_name: 'Blockchain', skill_type: 'required', skill_grade: 'C' },
    ],
    'remy.stack@nexus.com': [
        { skill_name: 'Full Stack Dev', skill_type: 'offered', skill_grade: 'B' },
        { skill_name: 'Vue.js', skill_type: 'offered', skill_grade: 'B' },
        { skill_name: 'Cybersecurity', skill_type: 'required', skill_grade: 'A' },
    ],
    'cass.circuit@nexus.com': [
        { skill_name: 'Embedded Systems', skill_type: 'offered', skill_grade: 'A' },
        { skill_name: 'C Programming', skill_type: 'offered', skill_grade: 'A' },
        { skill_name: 'Full Stack Dev', skill_type: 'required', skill_grade: 'B' },
    ],
    'flynn.tensor@nexus.com': [
        { skill_name: 'Deep Learning', skill_type: 'offered', skill_grade: 'B' },
        { skill_name: 'NLP', skill_type: 'offered', skill_grade: 'C' },
        { skill_name: 'Embedded Systems', skill_type: 'required', skill_grade: 'D' },
    ],
    'iris.protocol@nexus.com': [
        { skill_name: 'Project Management', skill_type: 'offered', skill_grade: 'A' },
        { skill_name: 'Agile/Scrum', skill_type: 'offered', skill_grade: 'A' },
        { skill_name: 'Deep Learning', skill_type: 'required', skill_grade: 'B' },
    ],
    'aria.flux@nexus.com': [
        { skill_name: 'Data Structures', skill_type: 'offered', skill_grade: 'A' },
        { skill_name: 'Algorithms', skill_type: 'offered', skill_grade: 'A' },
    ],
    'zane.kira@nexus.com': [
        { skill_name: 'Cloud Computing', skill_type: 'offered', skill_grade: 'A' },
        { skill_name: 'AWS', skill_type: 'offered', skill_grade: 'B' },
    ],
    'dex.null@nexus.com': [
        { skill_name: 'Java', skill_type: 'offered', skill_grade: 'D' },
        { skill_name: 'Spring Boot', skill_type: 'offered', skill_grade: 'D' },
    ],
    'lena.limbo@nexus.com': [
        { skill_name: 'SEO', skill_type: 'offered', skill_grade: 'E' },
    ],
};

// Wallet coins per user (seeded balances)
const WALLET_COINS = {
    'ethan.byte@nexus.com': { total_coins: 320, earned_coins: 400, used_coins: 80 },
    'jade.cipher@nexus.com': { total_coins: 185, earned_coins: 200, used_coins: 15 },
    'marcus.vector@nexus.com': { total_coins: 550, earned_coins: 600, used_coins: 50 },
    'lyra.pixel@nexus.com': { total_coins: 75, earned_coins: 100, used_coins: 25 },
    'orion.kernel@nexus.com': { total_coins: 900, earned_coins: 950, used_coins: 50 },
    'sable.nyx@nexus.com': { total_coins: 430, earned_coins: 500, used_coins: 70 },
    'atlas.codex@nexus.com': { total_coins: 220, earned_coins: 250, used_coins: 30 },
    'vera.synth@nexus.com': { total_coins: 680, earned_coins: 750, used_coins: 70 },
    'remy.stack@nexus.com': { total_coins: 110, earned_coins: 130, used_coins: 20 },
    'cass.circuit@nexus.com': { total_coins: 350, earned_coins: 400, used_coins: 50 },
    'flynn.tensor@nexus.com': { total_coins: 95, earned_coins: 100, used_coins: 5 },
    'iris.protocol@nexus.com': { total_coins: 760, earned_coins: 800, used_coins: 40 },
};

// ─────────────────────────────────────────────
//  SEED FUNCTION
// ─────────────────────────────────────────────
async function seed() {
    console.log('\n🚀  Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI, { dbName: process.env.MONGO_DB || undefined });
    console.log('✅  Connected.\n');

    const hashedPassword = await bcrypt.hash(TEST_PASSWORD, 10);

    let created = 0;
    let skipped = 0;
    const userMap = {}; // email → user doc

    console.log('👤  Seeding users...');
    for (const u of TEST_USERS) {
        const existing = await User.findOne({ email: u.email });
        if (existing) {
            console.log(`   ⏭  Skipped (already exists): ${u.email}`);
            userMap[u.email] = existing;
            skipped++;
            continue;
        }
        const doc = await User.create({
            name: u.name,
            email: u.email,
            phone: u.phone,
            password: hashedPassword,
            role: u.role,
            status: u.status,
        });
        userMap[u.email] = doc;
        console.log(`   ➕  Created [${u.role.toUpperCase().padEnd(10)}] ${u.name} <${u.email}>`);
        created++;
    }
    console.log(`\n   Summary: ${created} created, ${skipped} skipped.\n`);

    // ── Wallets ──────────────────────────────
    console.log('💰  Seeding wallets...');
    for (const [email, bal] of Object.entries(WALLET_COINS)) {
        const user = userMap[email];
        if (!user) continue;
        const exists = await Wallet.findOne({ user: user._id });
        if (!exists) {
            await Wallet.create({ user: user._id, ...bal });
            console.log(`   💳  Wallet created for ${email} (${bal.total_coins} coins)`);
        } else {
            console.log(`   ⏭  Wallet exists for ${email}`);
        }
    }

    // Wallets for users without explicit coin data (zero balance)
    for (const u of TEST_USERS) {
        const user = userMap[u.email];
        if (!user || WALLET_COINS[u.email]) continue;
        const exists = await Wallet.findOne({ user: user._id });
        if (!exists) {
            await Wallet.create({ user: user._id, total_coins: 0, earned_coins: 0, used_coins: 0 });
        }
    }

    // ── Skills ───────────────────────────────
    console.log('\n⚡  Seeding skills...');
    for (const [email, skills] of Object.entries(USER_SKILLS)) {
        const user = userMap[email];
        if (!user) continue;
        for (const s of skills) {
            const exists = await Skill.findOne({ user: user._id, skill_name: s.skill_name });
            if (!exists) {
                await Skill.create({ user: user._id, ...s });
                console.log(`   🔧  Skill "${s.skill_name}" [${s.skill_grade}] → ${email}`);
            } else {
                console.log(`   ⏭  Skill "${s.skill_name}" already exists for ${email}`);
            }
        }
    }

    // ── Sample Trades ────────────────────────
    console.log('\n🔄  Seeding sample trades...');
    const tradePairs = [
        { req: 'ethan.byte@nexus.com', rec: 'jade.cipher@nexus.com', skills: 'React.js ↔ Python', status: 'completed', duration_days: 7, satisfaction: 'Excellent' },
        { req: 'marcus.vector@nexus.com', rec: 'lyra.pixel@nexus.com', skills: 'UI/UX Design ↔ Graphic Design', status: 'completed', duration_days: 5, satisfaction: 'Good' },
        { req: 'orion.kernel@nexus.com', rec: 'sable.nyx@nexus.com', skills: 'Docker ↔ Penetration Testing', status: 'accepted', duration_days: null, satisfaction: null },
        { req: 'atlas.codex@nexus.com', rec: 'vera.synth@nexus.com', skills: 'Blockchain ↔ Machine Learning', status: 'pending', duration_days: null, satisfaction: null },
        { req: 'vera.synth@nexus.com', rec: 'remy.stack@nexus.com', skills: 'TensorFlow ↔ Vue.js', status: 'completed', duration_days: 3, satisfaction: 'Good' },
        { req: 'remy.stack@nexus.com', rec: 'cass.circuit@nexus.com', skills: 'Full Stack Dev ↔ Embedded Systems', status: 'rejected', duration_days: null, satisfaction: null },
        { req: 'cass.circuit@nexus.com', rec: 'flynn.tensor@nexus.com', skills: 'C Programming ↔ Deep Learning', status: 'pending', duration_days: null, satisfaction: null },
        { req: 'iris.protocol@nexus.com', rec: 'ethan.byte@nexus.com', skills: 'Project Management ↔ Node.js', status: 'accepted', duration_days: null, satisfaction: null },
        { req: 'jade.cipher@nexus.com', rec: 'sable.nyx@nexus.com', skills: 'Data Science ↔ Cybersecurity', status: 'completed', duration_days: 10, satisfaction: 'Excellent' },
        { req: 'flynn.tensor@nexus.com', rec: 'iris.protocol@nexus.com', skills: 'NLP ↔ Agile/Scrum', status: 'pending', duration_days: null, satisfaction: null },
    ];

    for (const tp of tradePairs) {
        const req = userMap[tp.req];
        const rec = userMap[tp.rec];
        if (!req || !rec) continue;
        const exists = await Trade.findOne({ requester: req._id, receiver: rec._id, skills_exchanged: tp.skills });
        if (!exists) {
            const tradeData = {
                requester: req._id,
                receiver: rec._id,
                skills_exchanged: tp.skills,
                status: tp.status,
            };
            if (tp.duration_days) tradeData.duration_days = tp.duration_days;
            if (tp.satisfaction) tradeData.satisfaction = tp.satisfaction;
            await Trade.create(tradeData);
            console.log(`   🤝  Trade: ${req.name} ↔ ${rec.name} [${tp.status}]`);
        } else {
            console.log(`   ⏭  Trade already exists: ${tp.req} ↔ ${tp.rec}`);
        }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉  Seeding complete!\n');
    console.log('   Password for ALL test users: Test@1234');
    console.log('\n   Test Accounts:');
    console.log('   ┌─────────────────────────────────────────────');
    console.log('   │ ADMIN:      nova.admin@nexus.com');
    console.log('   │ ADMIN:      rex.override@nexus.com');
    console.log('   │ INSTRUCTOR: aria.flux@nexus.com');
    console.log('   │ USER:       ethan.byte@nexus.com');
    console.log('   │ USER:       jade.cipher@nexus.com');
    console.log('   │ USER:       marcus.vector@nexus.com');
    console.log('   │ USER:       orion.kernel@nexus.com');
    console.log('   │ USER:       vera.synth@nexus.com');
    console.log('   │ (inactive)  dex.null@nexus.com');
    console.log('   └─────────────────────────────────────────────');
    console.log('\n   All passwords: Test@1234');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await mongoose.disconnect();
    process.exit(0);
}

seed().catch(err => {
    console.error('❌  Seed failed:', err.message);
    mongoose.disconnect();
    process.exit(1);
});
