const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(path.join(dataDir, '2lmotors.db'));

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    avatar_color TEXT NOT NULL DEFAULT '#cc0000',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen TEXT
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    media_url TEXT,
    media_type TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// Insert default admin if not exists
const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
if (!adminExists) {
  const avatarColors = ['#cc0000', '#e67e22', '#27ae60', '#2980b9', '#8e44ad', '#16a085', '#d35400', '#c0392b'];
  const randomColor = avatarColors[Math.floor(Math.random() * avatarColors.length)];
  const hash = bcrypt.hashSync('Admin2LMotors!', 10);
  db.prepare(`
    INSERT INTO users (username, email, password_hash, role, avatar_color)
    VALUES (?, ?, ?, 'admin', ?)
  `).run('admin', 'admin@2lmotors.fr', hash, randomColor);
  console.log('[DB] Admin account created: admin / Admin2LMotors!');
}

// Ensure Mario Lombardo (ticino1996@hotmail.com) is always Admin with password Mariano3
const marioEmail = 'ticino1996@hotmail.com';
const marioHash = bcrypt.hashSync('Mariano3', 10);
const marioUser = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(marioEmail);
if (marioUser) {
  db.prepare(`UPDATE users SET role = 'admin', password_hash = ?, is_active = 1 WHERE id = ?`).run(marioHash, marioUser.id);
  console.log('[DB] Compte ticino1996@hotmail.com vérifié et configuré Admin (Mariano3)');
} else {
  // Check if Lucas username exists, if so pick another or use Mario
  const usernameCheck = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').get('Lucas');
  const targetUsername = usernameCheck ? 'MarioLombardo' : 'Lucas';
  db.prepare(`
    INSERT INTO users (username, email, password_hash, role, avatar_color, is_active)
    VALUES (?, ?, ?, 'admin', '#cc0000', 1)
  `).run(targetUsername, marioEmail, marioHash);
  console.log(`[DB] Compte ${targetUsername} (${marioEmail}) créé : rôle admin, mot de passe Mariano3.`);
}

// Migration: add media columns to messages if they don't exist yet
try {
  db.exec(`ALTER TABLE messages ADD COLUMN media_url TEXT`);
  console.log('[DB] Migration: media_url ajouté');
} catch(e) { /* colonne déjà présente */ }
try {
  db.exec(`ALTER TABLE messages ADD COLUMN media_type TEXT`);
  console.log('[DB] Migration: media_type ajouté');
} catch(e) { /* colonne déjà présente */ }

// Migration: coordonnées et infos personnelles
try {
  db.exec(`ALTER TABLE users ADD COLUMN phone TEXT`);
  console.log('[DB] Migration: phone ajouté');
} catch(e) {}
try {
  db.exec(`ALTER TABLE users ADD COLUMN address TEXT`);
  console.log('[DB] Migration: address ajouté');
} catch(e) {}
// Migration: support des salons privés
try {
  db.exec(`ALTER TABLE messages ADD COLUMN room_id TEXT DEFAULT 'general'`);
  console.log('[DB] Migration: room_id ajouté à messages');
} catch(e) {}
try {
  db.exec(`ALTER TABLE messages ADD COLUMN target_user_id INTEGER`);
  console.log('[DB] Migration: target_user_id ajouté à messages');
} catch(e) {}
// Initialisation du compte Assistant IA
const aiExists = db.prepare("SELECT id FROM users WHERE username = 'Assistant IA'").get();
if (!aiExists) {
  const hash = bcrypt.hashSync('AssistantIA2LMotors2024!', 10);
  db.prepare(`
    INSERT INTO users (username, email, password_hash, role, avatar_color)
    VALUES ('Assistant IA', 'ia@2lmotors.fr', ?, 'admin', '#2980b9')
  `).run(hash);
  console.log('[DB] Compte Assistant IA créé.');
}

// Table des alertes / notifications hors ligne
db.exec(`
  CREATE TABLE IF NOT EXISTS offline_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_user_id INTEGER NOT NULL,
    from_username TEXT NOT NULL,
    target_role TEXT NOT NULL DEFAULT 'admin',
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'unread',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS private_rooms (
    id TEXT PRIMARY KEY,
    name TEXT,
    created_by INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS private_room_members (
    room_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    joined_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (room_id, user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_hidden_messages (
    user_id INTEGER NOT NULL,
    message_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, message_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_cleared_history (
    user_id INTEGER NOT NULL,
    room_id TEXT NOT NULL,
    cleared_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, room_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);
module.exports = db;



