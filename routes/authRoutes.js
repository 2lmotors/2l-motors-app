const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../database');

const AVATAR_COLORS = ['#cc0000', '#e67e22', '#27ae60', '#2980b9', '#8e44ad', '#16a085', '#d35400', '#c0392b'];

// POST /api/auth/register
router.post('/register', (req, res) => {
  const { username, email, password, phone, address } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Tous les champs sont requis.' });
  }
  if (username.length < 2 || username.length > 30) {
    return res.status(400).json({ error: 'Le nom d\'utilisateur doit contenir entre 2 et 30 caractères.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères.' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Email invalide.' });
  }

  try {
    const existingUser = db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email, username);
    if (existingUser) {
      return res.status(409).json({ error: 'Cet email ou ce nom d\'utilisateur est déjà utilisé.' });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const avatarColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];

    const result = db.prepare(`
      INSERT INTO users (username, email, password_hash, role, avatar_color, phone, address)
      VALUES (?, ?, ?, 'user', ?, ?, ?)
    `).run(username, email, passwordHash, avatarColor, phone || null, address || null);

    const user = db.prepare('SELECT id, username, email, role, avatar_color, is_active, phone, address, created_at, last_seen FROM users WHERE id = ?').get(result.lastInsertRowid);

    req.session.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      avatar_color: user.avatar_color,
      phone: user.phone || null,
      address: user.address || null,
      created_at: user.created_at
    };

    res.status(201).json({ success: true, user: req.session.user });
  } catch (err) {
    console.error('[Auth] Register error:', err);
    res.status(500).json({ error: 'Erreur serveur lors de l\'inscription.' });
  }
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe requis.' });
  }

  try {
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    if (!user) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect.' });
    }
    if (!user.is_active) {
      return res.status(403).json({ error: 'Ce compte a été désactivé. Contactez l\'administrateur.' });
    }

    const passwordValid = bcrypt.compareSync(password, user.password_hash);
    if (!passwordValid) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect.' });
    }

    // Interdiction stricte de connexion simultanée multi-appareils
    const checkOtherDevice = req.app.get('isUserConnectedOnOtherDevice');
    if (checkOtherDevice && checkOtherDevice(user.id, req.sessionID)) {
      return res.status(403).json({
        error: 'Ce compte est déjà connecté sur un autre appareil. La connexion simultanée est interdite. Veuillez d\'abord vous déconnecter de votre autre appareil.'
      });
    }

    // Update last_seen
    db.prepare('UPDATE users SET last_seen = datetime(\'now\') WHERE id = ?').run(user.id);

    req.session.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      avatar_color: user.avatar_color,
      phone: user.phone || null,
      address: user.address || null,
      created_at: user.created_at
    };

    res.json({ success: true, user: req.session.user });
  } catch (err) {
    console.error('[Auth] Login error:', err);
    res.status(500).json({ error: 'Erreur serveur lors de la connexion.' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  const userId = req.session && req.session.user ? req.session.user.id : null;
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur lors de la déconnexion.' });
    }
    res.clearCookie('2lmotors.sid');

    if (userId && req.app.get('disconnectUserSockets')) {
      req.app.get('disconnectUserSockets')(userId);
    }

    res.json({ success: true });
  });
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Non authentifié.' });
  }
  // Refresh user data from DB
  const user = db.prepare('SELECT id, username, email, role, avatar_color, is_active, phone, address, created_at, last_seen FROM users WHERE id = ?').get(req.session.user.id);
  if (!user || !user.is_active) {
    req.session.destroy(() => {});
    return res.status(401).json({ error: 'Session invalide.' });
  }
  res.json({ user });
});

module.exports = router;

