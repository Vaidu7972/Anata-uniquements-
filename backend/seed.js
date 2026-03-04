const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

const db = new sqlite3.Database('./database.sqlite');

async function seed() {
    const password = await bcrypt.hash('password123', 10);

    const users = [
        ['Alice Turing', 'alice@matrix.com', '111222333', password, 'user'],
        ['Bob Neuroni', 'bob@neural.io', '444555666', password, 'user'],
        ['Charlie Coder', 'charlie@dev.net', '777888999', password, 'user'],
        ['Diana Designer', 'diana@pixels.org', '000111222', password, 'user'],
        ['Ethan Admin', 'ethan@nexus.com', '333444555', password, 'admin'],
        ['Fiona Falcon', 'fiona@wings.io', '666777888', password, 'user'],
        ['George Data', 'george@stat.ai', '999000111', password, 'user']
    ];

    db.serialize(() => {
        const userStmt = db.prepare('INSERT OR IGNORE INTO Users (name, email, phone, password, role) VALUES (?, ?, ?, ?, ?)');
        const walletStmt = db.prepare('INSERT OR IGNORE INTO Wallet (user_id, total_coins, earned_coins, used_coins) VALUES (?, 100, 0, 0)');
        const skillStmt = db.prepare('INSERT OR IGNORE INTO Skills (user_id, skill_name, skill_type, skill_grade) VALUES (?, ?, ?, ?)');

        users.forEach((u) => {
            userStmt.run(u, function (err) {
                if (err) {
                    console.error(err);
                    return;
                }
                const userId = this.lastID;
                if (!userId) return; // Already exists

                walletStmt.run(userId);

                // Add some skills for each
                if (u[0] === 'Alice Turing') {
                    skillStmt.run(userId, 'AI Algorithms', 'offered', 'A');
                    skillStmt.run(userId, 'Web Development', 'required', 'B');
                } else if (u[0] === 'Bob Neuroni') {
                    skillStmt.run(userId, 'Machine Learning', 'offered', 'B');
                    skillStmt.run(userId, 'UI Design', 'required', 'C');
                } else if (u[0] === 'Charlie Coder') {
                    skillStmt.run(userId, 'Web Development', 'offered', 'A');
                    skillStmt.run(userId, 'Database Management', 'required', 'B');
                } else if (u[0] === 'Diana Designer') {
                    skillStmt.run(userId, 'UI Design', 'offered', 'A');
                    skillStmt.run(userId, 'Frontend Development', 'required', 'C');
                } else if (u[0] === 'Fiona Falcon') {
                    skillStmt.run(userId, 'Project Management', 'offered', 'B');
                    skillStmt.run(userId, 'AI Fundamentals', 'required', 'D');
                } else if (u[0] === 'George Data') {
                    skillStmt.run(userId, 'Python Scripting', 'offered', 'A');
                    skillStmt.run(userId, 'React JS', 'required', 'B');
                }
            });
        });

        userStmt.finalize();
        walletStmt.finalize();
        skillStmt.finalize();

        console.log('Seeding process initiated in backend...');
    });
}

seed().catch(console.error);
