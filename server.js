const express = require('express');
const http = require('http');
const https = require('https');
const { Server } = require('socket.io');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// --- Multer config ---
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    let ext = path.extname(file.originalname).toLowerCase();
    if (!ext) {
      if (file.mimetype.includes('webm')) ext = '.webm';
      else if (file.mimetype.includes('ogg')) ext = '.ogg';
      else if (file.mimetype.includes('mp4')) ext = '.mp4';
      else if (file.mimetype.includes('wav')) ext = '.wav';
      else ext = '.bin';
    }
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e6);
    cb(null, unique + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, true)
});

// Initialize DB first
const db = require('./database');
const gemini = require('./gemini');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingTimeout: 120000,
  pingInterval: 25000,
  connectTimeout: 45000,
  transports: ['websocket', 'polling']
});

// --- Session setup ---
const SQLiteStore = require('connect-sqlite3')(session);
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const sessionMiddleware = session({
  store: new SQLiteStore({ db: 'sessions.db', dir: dataDir }),
  secret: '2LMotors_Secret_K3y_2024!',
  resave: false,
  saveUninitialized: false,
  name: '2lmotors.sid',
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax'
  }
});

app.use(sessionMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Autoriser plein accès matériel (Caméra, Microphone, Géolocalisation, Autoplay) sur tous les navigateurs
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(self "*"), microphone=(self "*"), geolocation=(self "*"), autoplay=(self "*")');
  res.setHeader('Feature-Policy', 'camera *; microphone *; geolocation *; autoplay *');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  next();
});

io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

// Redirection vers le site officiel en ligne hébergé sur Render
app.get(['/site', '/site/*'], (req, res) => {
  res.redirect('https://twol-motors-lombardo.onrender.com/');
});

// --- Static files ---
app.use(express.static(path.join(__dirname, 'public')));
app.use('/logo', express.static(path.join(__dirname)));

// --- Téléchargements Applications Mobiles & Desktop ---
app.get(['/download/android', '/MOTORS-2L.apk'], (req, res) => {
  const file = path.join(__dirname, 'public', 'MOTORS-2L.apk');
  if (fs.existsSync(file)) {
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.download(file, 'MOTORS-2L.apk');
  } else {
    res.status(404).send('Fichier APK non disponible.');
  }
});

app.get(['/download/iphone', '/MOTORS-2L.mobileconfig'], (req, res) => {
  const file = path.join(__dirname, 'public', 'MOTORS-2L.mobileconfig');
  if (fs.existsSync(file)) {
    res.setHeader('Content-Type', 'application/x-apple-aspen-config; charset=utf-8');
    res.sendFile(file);
  } else {
    res.status(404).send('Profil iPhone non disponible.');
  }
});

app.get(['/download/windows', '/MOTORS-2L.exe'], (req, res) => {
  const file = path.join(__dirname, 'public', 'MOTORS-2L.exe');
  if (fs.existsSync(file)) {
    res.setHeader('Content-Type', 'application/octet-stream');
    res.download(file, 'MOTORS-2L.exe');
  } else {
    res.status(404).send('Exécutable Windows non disponible.');
  }
});

// --- Portail Officiel, QR Code Hub & Site Web 2L Motors ---
app.get(['/portail', '/hub'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'portail.html'));
});

// Route de connexion rapide administrateur
app.get('/api/auth/quick-admin', (req, res) => {
  const admin = db.prepare("SELECT * FROM users WHERE role = 'admin' AND username != 'Assistant IA' LIMIT 1").get();
  if (!admin) return res.status(404).send('Admin non trouvé');
  req.session.user = {
    id: admin.id,
    username: admin.username,
    email: admin.email,
    role: admin.role,
    avatar_color: admin.avatar_color,
    phone: admin.phone || null,
    address: admin.address || null,
    created_at: admin.created_at
  };
  res.redirect('/index.html');
});

// Upload route
app.post('/api/upload', (req, res, next) => {
  if (!req.session || !req.session.user) return res.status(401).json({ error: 'Non authentifié' });
  next();
}, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu' });
  let type = 'image';
  if (req.file.mimetype.startsWith('video/')) type = 'video';
  else if (req.file.mimetype.startsWith('audio/')) type = 'audio';
  res.json({
    url: `/uploads/${req.file.filename}`,
    type,
    originalName: req.file.originalname,
    size: req.file.size
  });
});

// --- Alert Admin Offline API ---
app.post('/api/alert-admin', (req, res) => {
  if (!req.session || !req.session.user) return res.status(401).json({ error: 'Non authentifié' });
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Message requis' });

  try {
    const insertResult = db.prepare(`
      INSERT INTO offline_alerts (from_user_id, from_username, message)
      VALUES (?, ?, ?)
    `).run(req.session.user.id, req.session.user.username, message);

    const alertPayload = {
      id: Number(insertResult.lastInsertRowid),
      fromUserId: req.session.user.id,
      fromUser: req.session.user.username,
      message,
      createdAt: new Date().toISOString()
    };

    // Diffuser à tous les connectés (Admins et Chat)
    io.emit('admin offline alert', alertPayload);

    res.json({ success: true, alert: alertPayload, message: 'Notification envoyée avec succès à l\'administrateur.' });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// State tracking (Activité, Appareils & Sockets en direct)
const onlineUsers = new Map();
const userLocations = new Map();
const activeLiveSessions = new Map(); // roomId => { roomId, adminId, participants: Map(userId => info), active: true, adminPresent: bool }

function isUserConnectedOnOtherDevice(userId, currentSessionId = null) {
  for (const [sockId, u] of onlineUsers.entries()) {
    if (u.id === userId) {
      if (!currentSessionId || (u.sessionID && u.sessionID !== currentSessionId)) {
        return true;
      }
    }
  }
  return false;
}

function disconnectUserSockets(userId) {
  for (const [sockId, u] of onlineUsers.entries()) {
    if (u.id === userId) {
      const sock = io.sockets.sockets.get(sockId);
      if (sock) sock.disconnect(true);
      onlineUsers.delete(sockId);
    }
  }
}

app.set('isUserConnectedOnOtherDevice', isUserConnectedOnOtherDevice);
app.set('disconnectUserSockets', disconnectUserSockets);

// --- Routes ---
const authRoutes = require('./routes/authRoutes');
const chatRoutes = require('./routes/chatRoutes');
const adminRoutes = require('./routes/adminRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/messages', chatRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/admin/locations', (req, res) => {
  if (!req.session || !req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Accès refusé' });
  }
  const result = {};
  userLocations.forEach((loc, userId) => { result[userId] = loc; });
  res.json({ locations: result });
});

app.get('/api/media', (req, res) => {
  if (!req.session || !req.session.user) return res.status(401).json({ error: 'Non authentifié' });
  const userId = req.session.user.id;
  try {
    // Récupérer la date de remise à zéro éventuelle de la médiathèque pour cet utilisateur
    let clearedAt = null;
    try {
      const clearedRow = db.prepare("SELECT cleared_at FROM user_cleared_history WHERE user_id = ? AND room_id = 'media'").get(userId);
      if (clearedRow && clearedRow.cleared_at) clearedAt = clearedRow.cleared_at;
    } catch(e) {}

    let files;
    if (clearedAt) {
      files = db.prepare(`
        SELECT m.id, m.user_id, m.username, m.media_url, m.media_type, m.content, m.created_at, u.avatar_color
        FROM messages m
        LEFT JOIN users u ON m.user_id = u.id
        WHERE m.media_url IS NOT NULL AND m.media_url != ''
          AND datetime(m.created_at) > datetime(?)
          AND m.id NOT IN (SELECT message_id FROM user_hidden_messages WHERE user_id = ?)
        ORDER BY m.created_at DESC
        LIMIT 200
      `).all(clearedAt, userId);
    } else {
      files = db.prepare(`
        SELECT m.id, m.user_id, m.username, m.media_url, m.media_type, m.content, m.created_at, u.avatar_color
        FROM messages m
        LEFT JOIN users u ON m.user_id = u.id
        WHERE m.media_url IS NOT NULL AND m.media_url != ''
          AND m.id NOT IN (SELECT message_id FROM user_hidden_messages WHERE user_id = ?)
        ORDER BY m.created_at DESC
        LIMIT 200
      `).all(userId);
    }
    res.json({ files });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/media/clear-my-media (Vider la médiathèque de son propre affichage)
app.post('/api/media/clear-my-media', (req, res) => {
  if (!req.session || !req.session.user) return res.status(401).json({ error: 'Non authentifié' });
  const userId = req.session.user.id;
  try {
    db.prepare(`
      INSERT INTO user_cleared_history (user_id, room_id, cleared_at)
      VALUES (?, 'media', datetime('now'))
      ON CONFLICT(user_id, room_id) DO UPDATE SET cleared_at = datetime('now')
    `).run(userId);
    res.json({ success: true, message: 'Votre médiathèque a été entièrement vidée.' });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API GESTION DES SALONS PRIVÉS MULTI-MEMBRES (MAXIMUM 4) ---

function ensurePrivateRoomInitialized(roomId, currentUserId) {
  let room = db.prepare('SELECT * FROM private_rooms WHERE id = ?').get(roomId);
  if (!room && roomId.startsWith('private_')) {
    db.prepare('INSERT OR IGNORE INTO private_rooms (id, name, created_by) VALUES (?, ?, ?)').run(roomId, 'Salon Privé', currentUserId);
    const parts = roomId.split('_');
    if (parts.length >= 3) {
      const u1 = parseInt(parts[1], 10);
      const u2 = parseInt(parts[2], 10);
      if (!isNaN(u1) && db.prepare('SELECT id FROM users WHERE id = ?').get(u1)) {
        db.prepare('INSERT OR IGNORE INTO private_room_members (room_id, user_id) VALUES (?, ?)').run(roomId, u1);
      }
      if (!isNaN(u2) && db.prepare('SELECT id FROM users WHERE id = ?').get(u2)) {
        db.prepare('INSERT OR IGNORE INTO private_room_members (room_id, user_id) VALUES (?, ?)').run(roomId, u2);
      }
    }
  }
}

app.get('/api/private-rooms/details/:roomId', (req, res) => {
  if (!req.session || !req.session.user) return res.status(401).json({ error: 'Non authentifié' });
  const { roomId } = req.params;
  try {
    ensurePrivateRoomInitialized(roomId, req.session.user.id);
    const members = db.prepare(`
      SELECT u.id, u.username, u.avatar_color, u.role, prm.joined_at
      FROM private_room_members prm
      JOIN users u ON prm.user_id = u.id
      WHERE prm.room_id = ?
      ORDER BY prm.joined_at ASC
    `).all(roomId);
    res.json({
      roomId,
      memberCount: members.length,
      maxMembers: 4,
      canAddMore: members.length < 4,
      members
    });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/private-rooms/available-users/:roomId', (req, res) => {
  if (!req.session || !req.session.user) return res.status(401).json({ error: 'Non authentifié' });
  const { roomId } = req.params;
  try {
    ensurePrivateRoomInitialized(roomId, req.session.user.id);
    const users = db.prepare(`
      SELECT id, username, email, role, avatar_color
      FROM users
      WHERE is_active = 1
        AND username != 'Assistant IA'
        AND id NOT IN (SELECT user_id FROM private_room_members WHERE room_id = ?)
      ORDER BY username ASC
    `).all(roomId);
    res.json({ users, availableUsers: users });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/private-rooms/add-member', (req, res) => {
  if (!req.session || !req.session.user) return res.status(401).json({ error: 'Non authentifié' });
  if (req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Seul un administrateur peut ajouter un membre à ce salon privé.' });
  }
  const { roomId, userId } = req.body;
  if (!roomId || !userId) return res.status(400).json({ error: 'Données manquantes.' });

  try {
    ensurePrivateRoomInitialized(roomId, req.session.user.id);
    const countRow = db.prepare('SELECT COUNT(*) as count FROM private_room_members WHERE room_id = ?').get(roomId);
    if (countRow.count >= 4) {
      return res.status(400).json({ error: 'Limite maximale de 4 participants atteinte pour ce salon privé.' });
    }

    const targetUser = db.prepare('SELECT id, username, avatar_color, role FROM users WHERE id = ?').get(userId);
    if (!targetUser) return res.status(404).json({ error: 'Utilisateur introuvable.' });

    db.prepare('INSERT OR IGNORE INTO private_room_members (room_id, user_id) VALUES (?, ?)').run(roomId, targetUser.id);
    const members = db.prepare(`
      SELECT u.id, u.username, u.avatar_color, u.role
      FROM private_room_members prm
      JOIN users u ON prm.user_id = u.id
      WHERE prm.room_id = ?
    `).all(roomId);

    io.to(roomId).emit('private-room-member-added', {
      roomId,
      addedUser: targetUser,
      members,
      memberCount: members.length
    });
    io.to(`user_${targetUser.id}`).emit('added-to-private-room', {
      roomId,
      members,
      addedBy: req.session.user.username
    });

    res.json({
      success: true,
      message: `${targetUser.username} a été ajouté au salon privé.`,
      memberCount: members.length,
      members
    });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API GESTION DES SALONS PRIVÉS MULTI-MEMBRES (MAXIMUM 4) ---

function ensurePrivateRoomInitialized(roomId, currentUserId) {
  let room = db.prepare('SELECT * FROM private_rooms WHERE id = ?').get(roomId);
  if (!room && roomId.startsWith('private_')) {
    db.prepare('INSERT OR IGNORE INTO private_rooms (id, name, created_by) VALUES (?, ?, ?)').run(roomId, 'Salon Privé', currentUserId);
    const parts = roomId.split('_');
    if (parts.length >= 3) {
      const u1 = parseInt(parts[1], 10);
      const u2 = parseInt(parts[2], 10);
      if (!isNaN(u1) && db.prepare('SELECT id FROM users WHERE id = ?').get(u1)) {
        db.prepare('INSERT OR IGNORE INTO private_room_members (room_id, user_id) VALUES (?, ?)').run(roomId, u1);
      }
      if (!isNaN(u2) && db.prepare('SELECT id FROM users WHERE id = ?').get(u2)) {
        db.prepare('INSERT OR IGNORE INTO private_room_members (room_id, user_id) VALUES (?, ?)').run(roomId, u2);
      }
    }
  }
}

app.get('/api/private-rooms/details/:roomId', (req, res) => {
  if (!req.session || !req.session.user) return res.status(401).json({ error: 'Non authentifié' });
  const { roomId } = req.params;
  try {
    ensurePrivateRoomInitialized(roomId, req.session.user.id);
    const members = db.prepare(`
      SELECT u.id, u.username, u.avatar_color, u.role, prm.joined_at
      FROM private_room_members prm
      JOIN users u ON prm.user_id = u.id
      WHERE prm.room_id = ?
      ORDER BY prm.joined_at ASC
    `).all(roomId);
    res.json({
      roomId,
      memberCount: members.length,
      maxMembers: 4,
      canAddMore: members.length < 4,
      members
    });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/private-rooms/available-users/:roomId', (req, res) => {
  if (!req.session || !req.session.user) return res.status(401).json({ error: 'Non authentifié' });
  const { roomId } = req.params;
  try {
    ensurePrivateRoomInitialized(roomId, req.session.user.id);
    const users = db.prepare(`
      SELECT id, username, email, role, avatar_color
      FROM users
      WHERE is_active = 1
        AND username != 'Assistant IA'
        AND id NOT IN (SELECT user_id FROM private_room_members WHERE room_id = ?)
      ORDER BY username ASC
    `).all(roomId);
    res.json({ users, availableUsers: users });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/private-rooms/add-member', (req, res) => {
  if (!req.session || !req.session.user) return res.status(401).json({ error: 'Non authentifié' });
  if (req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Seul un administrateur peut ajouter un membre à ce salon privé.' });
  }
  const { roomId, userId } = req.body;
  if (!roomId || !userId) return res.status(400).json({ error: 'Données manquantes.' });

  try {
    ensurePrivateRoomInitialized(roomId, req.session.user.id);
    const countRow = db.prepare('SELECT COUNT(*) as count FROM private_room_members WHERE room_id = ?').get(roomId);
    if (countRow.count >= 4) {
      return res.status(400).json({ error: 'Limite maximale de 4 participants atteinte pour ce salon privé.' });
    }

    const targetUser = db.prepare('SELECT id, username, avatar_color, role FROM users WHERE id = ?').get(userId);
    if (!targetUser) return res.status(404).json({ error: 'Utilisateur introuvable.' });

    db.prepare('INSERT OR IGNORE INTO private_room_members (room_id, user_id) VALUES (?, ?)').run(roomId, targetUser.id);
    const members = db.prepare(`
      SELECT u.id, u.username, u.avatar_color, u.role
      FROM private_room_members prm
      JOIN users u ON prm.user_id = u.id
      WHERE prm.room_id = ?
    `).all(roomId);

    io.to(roomId).emit('private-room-member-added', {
      roomId,
      addedUser: targetUser,
      members,
      memberCount: members.length
    });
    io.to(`user_${targetUser.id}`).emit('added-to-private-room', {
      roomId,
      members,
      addedBy: req.session.user.username
    });

    res.json({
      success: true,
      message: `${targetUser.username} a été ajouté au salon privé.`,
      memberCount: members.length,
      members
    });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Route introuvable.' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ====================================================================================
// MOTEUR EXPERT DIAGNOSTIC AUTOMOBILE & VÉHICULES MOTORISÉS - MOTORS 2L ATELIER PRO
// ====================================================================================

function generateAutomotiveAiReply(userPrompt) {
  const raw = (userPrompt || '').trim();
  const p = raw.toLowerCase();

  // Extraction d'année
  const yearMatch = p.match(/\b(19\d{2}|20\d{2})\b/);
  const detectedYear = yearMatch ? parseInt(yearMatch[1], 10) : null;

  // Détection de code OBD standard (ex: P0401, P0300, C1201, U0100...)
  const obdMatch = p.match(/\b([pbcsu]\d{4})\b/i);
  if (obdMatch) {
    const code = obdMatch[1].toUpperCase();
    return getObdCodeAnalysis(code, raw);
  }

  // 1. MOTOS, DEUX-ROUES & VÉHICULES MOTORISÉS SPÉCIFIQUES
  if (p.includes('moto') || p.includes('scooter') || p.includes('tmax') || p.includes('yamaha') || p.includes('honda') || p.includes('kawasaki') || p.includes('ducati') || p.includes('bmw r') || p.includes('quad')) {
    return getMotorcycleDiagnosis(p, raw);
  }

  // 2. VÉHICULES UTILITAIRES / POIDS LOURDS / FOURGONS (Master, Ducato, Boxer, Sprinter, Transit)
  if (p.includes('fourgon') || p.includes('utilitaire') || p.includes('sprinter') || p.includes('crafter') || p.includes('master') || p.includes('ducato') || p.includes('transit') || p.includes('boxer') || p.includes('jumper')) {
    return getUtilityVehicleDiagnosis(p, raw);
  }

  // 3. VÉHICULES ÉLECTRIQUES & HYBRIDES (Tesla, Zoé, Prius, E-208, ID.3, ID.4...)
  if (p.includes('electrique') || p.includes('électrique') || p.includes('tesla') || p.includes('batterie ht') || p.includes('onduleur') || p.includes('recharge') || p.includes('inverter') || p.includes('zoe') || p.includes('zoé')) {
    return getEvHybridDiagnosis(p, raw);
  }

  // 4. MOTEURS ET PANNES CHRONIQUES CONSTRUCTEURS CIBLÉES

  // PSA / STELLANTIS (PureTech, BlueHDi, THP, HDI)
  if (p.includes('puretech') || p.includes('1.2') || (p.includes('peugeot') && p.includes('courroie')) || (p.includes('citroen') && p.includes('courroie')) || (p.includes('208') && p.includes('huile')) || (p.includes('3008') && p.includes('pression d\'huile'))) {
    return `🚨 **DIAGNOSTIC CRITIQUE STELLANTIS : Moteur 1.2 PureTech (EB2 - 2013-2022)**

🔍 **Mécanisme de la panne** :
Ce moteur utilise une courroie de distribution humide baignant dans les vapeurs d'huile et le carburant imbrûlé. Le vieillissement chimique de la courroie entraîne un effilochage du caoutchouc. Les particules descendent dans le carter inférieur et colmatent :
1. La **crépine de la pompe à huile** (chute brutale de pression d'huile au tableau de bord).
2. L'alimentation en huile de la **pompe à vide d'assistance au freinage** (la pédale de frein devient dure comme du bois à l'approche d'un freinage d'urgence !).
3. Les électrovannes de déphaseurs d'arbres à cames (VVT).

🔧 **Protocole d'intervention certifié chez MOTORS 2L** :
- **Contrôle visuel jauge d'épaisseur** par le bouchon de remplissage d'huile.
- **Dépose du carter d'huile** : Nettoyage méticuleux de la crépine et vérification des portées de vilebrequin.
- **Remplacement complet du kit de distribution** (nouvelle référence renforcée) + joint spi vilebrequin.
- **Remplacement de la pompe à vide** si contaminée.
- **Rinçage moteur & vidange** impérative avec huile homologuée constructeur **PSA B71 2297** ou **B71 2010** (0W20 / 0W30).`;
  }

  if (p.includes('adblue') || p.includes('bluehdi') || p.includes('défaut antipollution') || p.includes('démarrage impossible') || p.includes('uree') || p.includes('urée')) {
    return `⚠️ **DIAGNOSTIC SYSTÈME ANTIPOLLUTION SCR / ADBLUE (Diesel Euro 6)**

🔍 **Origine de la défaillance** :
La cause majeure est la **cristallisation de l'urée** (AUS 32) dès que la température baisse ou suite à l'évaporation d'eau. Les cristaux bloquent :
- L'injecteur AdBlue monté sur la ligne d'échappement en amont du catalyseur SCR.
- La pompe d'alimentation intégrée au réservoir AdBlue (surpression ou absence de montée en pression).
- La sonde de niveau ou le capteur de NOx aval.

📋 **Conséquence** : Déclenchement du compte à rebours légal européen : *"Démarrage impossible dans XXX km"*.

🔧 **Procédure de remise en état chez MOTORS 2L** :
1. Lecture des valeurs réelles de pression du circuit d'urée (consigne : ~5 à 6 bars).
2. Dépose et détartrage à l'eau déminéralisée chaude de l'injecteur d'urée.
3. Test de l'élément chauffant et traitement curatif anti-cristallisant haute concentration.
4. Réinitialisation et réapprentissage des adaptations NOx au calculateur moteur.`;
  }

  // RENAULT / DACIA / NISSAN (1.2 TCe, 1.5 dCi, 1.6 dCi, EDC)
  if (p.includes('renault') || p.includes('dacia') || p.includes('clio') || p.includes('megane') || p.includes('captur') || p.includes('scenic') || p.includes('duster') || p.includes('tce') || p.includes('1.5 dci') || p.includes('k9k')) {
    if (p.includes('1.2 tce') || p.includes('h5ft') || p.includes('consommation d\'huile') || p.includes('huile')) {
      return `⚠️ **EXPERTISE TECHNIQUE : Renault / Dacia / Nissan 1.2 TCe (H5Ft - Euro 5/6, 2012-2018)**

🔍 **Phénomène technique identifié** :
Une dépression trop forte dans le collecteur d'admission, combinée à une segmentation de pistons peu performante et à un encrassement précoce des soupapes d'admission (injection directe), entraîne une **surconsommation d'huile massive (> 1L / 1000 km)**.
🔥 **Risque** : Fonte d'une soupape d'échappement par auto-allumage (LSPI) ou rupture de la chaîne de distribution par manque de lubrification du tendeur hydraulique.

🔧 **Actions recommandées 2LMotors** :
- Prise des compressions cylindres à froid et à chaud (détection de cylindre fuyant).
- Passage de caméra endoscopique pour inspecter les têtes de soupapes.
- Mise à jour de la cartographie calculateur injection (modification de la gestion des déphaseurs VVT).`;
    }

    if (p.includes('dci') || p.includes('injection') || p.includes('limaille') || p.includes('delphi')) {
      return `⚙️ **DIAGNOSTIC INJECTION RENAULT 1.5 dCi / 1.6 dCi** :
- **Sur 1.5 dCi injection Delphi** : Risque historique de désagrégation des rouleaux de la pompe haute pression générant de la **limaille métallique** dorée/argentée dans le filtre à gazole, détruisant instantanément les 4 injecteurs.
- **Sur 1.6 dCi Energy (R9M)** : Pannes fréquentes de la vanne EGR basse pression (située sous le turbo) et du volet d'échappement piloté.
👉 Contrôle immédiat du fond de bocal de filtre à gazole à l'aimant chez **MOTORS 2L** pour écarter toute pollution ferreuse.`;
    }
  }

  // GROUPE VAG (VW, AUDI, SEAT, SKODA - TSI, TFSI, TDI, DSG)
  if (p.includes('volkswagen') || p.includes('golf') || p.includes('audi') || p.includes('seat') || p.includes('skoda') || p.includes('polo') || p.includes('a3') || p.includes('a4') || p.includes('tiguan') || p.includes('dsg') || p.includes('s tronic') || p.includes('tdi')) {
    if (p.includes('dsg') || p.includes('boite') || p.includes('boîte') || p.includes('patine') || p.includes('a-coup') || p.includes('rapport')) {
      return `⚙️ **EXPERTISE BOÎTES DOUBLE EMBRAYAGE VAG (DSG6 DQ250 / DSG7 DQ200 / DQ381 / DQ500)**

🔍 **Distingo crucial** :
1. **DQ200 (7 vitesses à embrayages secs)** : Pas d'huile dans l'embrayage. Symptômes : broutements vifs au démarrage en 1ère et passage en 2ème, voyant clé clignotant au tableau de bord. Défaillance fréquente de l'accumulateur de pression du mécatronique hydraulique (micro-fissure du bloc aluminium).
2. **DQ250 / DQ381 (embrayages multidisques humides)** : Nécessite une vidange scrupuleuse avec remplacement du filtre tous les 60 000 km.
🔧 **Intervention MOTORS 2L** : Remplacement du corps mécatronique renforcé, vidange spécifique et réapprentissage complet des points de léchage d'embrayages par valise ODIS/VCDS.`;
    }

    if (p.includes('tdi') || p.includes('fap') || p.includes('vanne egr') || p.includes('p2002') || p.includes('p0401')) {
      return `🔧 **DIAGNOSTIC DIESEL VAG 1.6 TDI / 2.0 TDI (CRBC, CUNA, CRLB, CAYC...)** :
- **Voyant de préchauffage clignotant + mode dégradé** : Grippage du radiateur/vanne EGR arrière (refroidisseur EGR encrassé par les condensats acides).
- **Usure des injecteurs 1.6 TDI Continental/VDO** : Claquement métallique caractéristique à froid entre 1200 et 1800 tr/min.
- **Pompe à eau pilotée** : Défaillance de la bague coulissante d'obturation de la pompe à eau provoquant une surchauffe moteur intermittente à 130°C puis redescente à 90°C.
👉 Contrôle complet au banc diagnostic **MOTORS 2L**.`;
    }
  }

  // BMW / MINI (Moteurs N47, B47, N20, B48, THP Cooper S)
  if (p.includes('bmw') || p.includes('mini') || p.includes('cooper') || p.includes('serie 1') || p.includes('serie 3') || p.includes('n47') || p.includes('b47') || p.includes('vanos') || p.includes('chaine')) {
    if (p.includes('chaine') || p.includes('bruit') || p.includes('cigale') || p.includes('distribution')) {
      return `🚨 **DOSSIER DISTRIBUTION BMW / MINI (Moteurs Diesel N47 / B47 & Essence N20)** :
- **Moteur N47 2.0d (2007-2015)** : La distribution est positionnée à l'arrière du moteur contre l'habitacle. Les pignons d'arbres à cames et de pompe haute pression usent prématurément les maillons de chaîne. Bruit de frottement/cigale dès 1500 tr/min. En cas de casse : soupapes tordues et culbuteurs brisés.
- **Moteur Essence N20 / THP** : Allongement de la chaîne et effritement des patins en plastique qui tombent dans la pompe à huile.
🔧 **Chantier atelier chez MOTORS 2L** : Dépose de la boîte de vitesses / moteur, remplacement du kit 3 chaînes renforcées, tendeurs hydrauliques modifiés et pignons neufs.`;
    }
  }

  // MERCEDES-BENZ (OM651, OM642, Boîtes 7G-Tronic / 9G-Tronic, Airmatic)
  if (p.includes('mercedes') || p.includes('classe a') || p.includes('classe c') || p.includes('classe e') || p.includes('cdi') || p.includes('om651') || p.includes('om642') || p.includes('7g-tronic')) {
    return `🔧 **EXPERTISE TECHNIQUE MERCEDES-BENZ** :
- **Moteur 2.1 CDI OM651** : Fuite d'eau au boîtier de filtre à carburant en plastique ou au collecteur d'eau sur culasse ; usure de la capsule de dépression double étage du bi-turbo.
- **Moteur V6 3.0 CDI OM642** : Fuite d'huile bien connue au refroidisseur d'huile situé au fond du V moteur (joints violets fuyards qui coulent sous la cloche d'embrayage) et grippage du servomoteur de commande des volets de turbulence d'admission (M55).
- **Boîte 7G-Tronic (722.9)** : Capteurs de vitesse de rotation d'arbres Y3/8n1 et Y3/8n2 défaillants sur la platine électronique conducteur.
👉 Diagnostic approfondi et remplacement des platines chez **MOTORS 2L**.`;
  }

  // FORD (EcoBoost 1.0, 2.0 TDCi, Boîte Powershift)
  if (p.includes('ford') || p.includes('ecoboost') || p.includes('powershift') || p.includes('transit')) {
    if (p.includes('ecoboost') || p.includes('1.0') || p.includes('chauffe')) {
      return `⚠️ **ALERTE FORD 1.0 ECOBOOST (3 cylindres turbo)** :
1. **Courroie de distribution humide** : Comme chez Stellantis, la courroie baigne dans l'huile et bouche la crépine.
2. **Durite de dégazage** : Rupture cassante de la petite durite rigide en plastique reliant le vase d'expansion à la culasse. Fuite instantanée de liquide de refroidissement, surchauffe brutale sans avertissement et fissure de la culasse/bloc cylindres.
🔧 **MOTORS 2L** : Contrôle du kit distribution et remplacement préventif des durites de refroidissement modifiées en silicone.`;
    }
  }

  // 5. ANATOMIE DES PANNES PAR COMPOSANTS GÉNÉRAUX

  // TURBO & SURALIMENTATION
  if (p.includes('turbo') || p.includes('siffle') || p.includes('pression de suralimentation') || p.includes('wastegate')) {
    return `🌪️ **ANALYSE TECHNIQUE DU TURBOCOMPRESSEUR** :
- **Sifflement aigu type sirène de police** : Déséquilibre de la turbine, frottement des ailettes sur le carter d'admission ou jeu excessif dans les paliers hydrodynamiques. Risque de casse de l'axe et d'emballement moteur par passage d'huile dans l'admission !
- **Bruit de souffle d'air puissant à l'accélération** : Durite d'échangeur d'air (intercooler) fendue ou déboîtée.
- **Perte de puissance au-dessus de 2500 tr/min** : Géométrie variable grippée par la calamine ou électrovanne N75 de pilotage à dépression défaillante.
👉 Contrôle immédiat du jeu axial/radial du turbo chez **MOTORS 2L**.`;
  }

  // EMBRAYAGE & VOLANT MOTEUR BI-MASSE
  if (p.includes('embrayage') || p.includes('volant moteur') || p.includes('bi-masse') || p.includes('pedale') || p.includes('butée')) {
    return `⚙️ **DIAGNOSTIC TRANSMISSION : EMBRAYAGE & VOLANT MOTEUR BI-MASSE (DMF)** :
- **Tremblements intenses dans toute la caisse au démarrage en 1ère** : Ressorts d'amortissement du volant moteur bi-masse affaissés ou avec jeu angulaire hors cote constructeur (> 6-7 dents).
- **Bruit métallique de casserole au ralenti qui s'arrête net quand on appuie sur la pédale d'embrayage** : Butée d'embrayage hydraulique détruite ou volant moteur bi-masse en fin de vie.
- **Régime moteur qui monte dans les tours sans accélération en 4ème/5ème** : Disque d'embrayage glacé ou usé jusqu'aux rivets.
👉 Devis et remplacement complet du kit 4 pièces (volant bi-masse, disque, mécanisme, butée hydraulique) chez **MOTORS 2L**.`;
  }

  // FAP & VANNE EGR
  if (p.includes('fap') || p.includes('filtre a particule') || p.includes('filtre à particules') || p.includes('egr') || p.includes('suie')) {
    return `💨 **SYSTÈME ANTIPOLLUTION : FILTRE À PARTICULES & VANNE EGR** :
- **Masse de suie accumulée > 45g** : Le FAP ne peut plus lancer de régénération automatique sur autoroute, la contre-pression d'échappement augmente et étouffe le moteur.
- **Causes racines fréquentes** : Thermostat d'eau bloqué ouvert (si le moteur n'atteint pas 80°C, la régénération est refusée par le calculateur !), bougies de préchauffage grillées, ou capteur de pression différentielle défaillant.
🔧 **Prestations MOTORS 2L** : Nettoyage hydrogène ou par injection chimique de solvant décalaminant sans démontage, puis régénération statique forcée pilotée à la valise.`;
  }

  // SYSTÈME DE DÉMARRAGE & ALTERNATEUR
  if (p.includes('démarre pas') || p.includes('demarre pas') || p.includes('batterie') || p.includes('alternateur') || p.includes('démarreur')) {
    return `⚡ **DIAGNOSTIC CIRCUIT DE DÉMARRAGE & CHARGE ÉLECTRIQUE** :
1. **Un simple "clac-clac" au tour de clé** :
   - Tension de batterie au repos inférieure à **11.9V** (déchargée ou élément en court-circuit).
   - Solénoïde de démarreur charbonné ou tresse de masse moteur oxydée.
2. **Le démarreur tourne vite mais le moteur ne se lance pas** :
   - Capteur PMH (régime vilebrequin) ne transmettant pas les tours/min au calculateur.
   - Désamorçage du circuit de carburant (prise d'air sur filtre) ou pompe de gavage HS.
3. **Voyant batterie allumé en roulant** :
   - Alternateur ne recharge plus (la tension aux bornes de la batterie moteur tournant doit être comprise entre **13.8V et 14.4V**).
👉 Test de batterie professionnel et test de pont de diodes alternateur chez **MOTORS 2L**.`;
  }

  // TRAIN ROULANT, FREINS & DIRECTION
  if (p.includes('frein') || p.includes('direction') || p.includes('volant') || p.includes('amortisseur') || p.includes('triangle') || p.includes('rotule')) {
    return `🛠️ **CHÂSSIS, FREINAGE & TRAIN ROULANT** :
- **Vibration au volant exclusive au freinage à 100-110 km/h** : Voile thermique des disques de frein avant (au-delà de 0.05 mm de faux-rond au comparateur).
- **Flou dans la trajectoire ou claquement sec sur chaussée dégradée** : Silentblocs arrière de triangles de suspension déchirés ou jeu dans les biellettes de barre stabilisatrice.
- **Direction dure ou à-coups dans le volant** : Manque de fluide de direction assistée ou défaillance du capteur d'angle de braquage sur colonne électrique.
👉 Contrôle complet sur pont élévateur et géométrie laser 3D chez **MOTORS 2L**.`;
  }

  // Formule d'accueil et d'orientation générale
  return `🔧 **CONSULTANT TECHNIQUE SUPÉRIEUR MOTORS 2L**

J'ai bien pris en compte votre demande. Afin de vous donner le **diagnostic exact, les codes défauts probables (DTC) et le devis constructeur précis** :
1. **Marque, Modèle et Cylindrée** (ex: *Audi A3 2.0 TDI 150ch*, *Peugeot 208 1.2 PureTech 110*...)
2. **Année de première mise en circulation**
3. **Kilométrage actuel**
4. **Symptômes constatés** : *Voyant moteur fixe/clignotant ? Perte de puissance ? Bruit suspect à chaud ou à froid ? Pédale molle ?*

Détaillez vos observations, je vous apporte l'analyse mécanique chirurgicale !`;
}

// -------------------------------------------------------------
// FONCTIONS EXPERTES COMPLÉMENTAIRES
// -------------------------------------------------------------

function getObdCodeAnalysis(code, raw) {
  const codes = {
    'P0300': 'Ratés d\'allumage multiples et aléatoires détectés (causes : bougies, bobines crayons, injecteurs encrassés ou compression faible).',
    'P0301': 'Raté d\'allumage cylindre 1.',
    'P0302': 'Raté d\'allumage cylindre 2.',
    'P0303': 'Raté d\'allumage cylindre 3.',
    'P0304': 'Raté d\'allumage cylindre 4.',
    'P0401': 'Débit de recyclage des gaz d\'échappement (EGR) insuffisant (vanne encrassée, tuyau EGR colmaté).',
    'P0420': 'Rendement du système de catalyseur en dessous du seuil (catalyseur usé ou sonde lambda aval 2 fuyarde).',
    'P0171': 'Système trop pauvre - Ligne 1 (prise d\'air admission, débitmètre massique défaillant ou pression carburant basse).',
    'P0172': 'Système trop riche - Ligne 1 (injecteur fuyard, régulateur de pression grippé, filtre à air saturé).',
    'P2002': 'Efficacité du filtre à particules diesel sous le seuil - Banque 1 (FAP colmaté ou durite capteur différentiel brûlée).',
    'P2563': 'Positionneur de géométrie variable du turbocompresseur - signal hors plage de consigne.',
    'P0087': 'Pression de la rampe de distribution de carburant trop basse (pompe HP faiblarde ou régulateur fuyard).',
    'P0520': 'Capteur / commutateur de pression d\'huile moteur - problème de plage/rendement.'
  };

  const desc = codes[code] || 'Code défaut de diagnostic de gestion moteur/transmission standardisé OBD-II.';

  return `📟 **ANALYSE EXPERTE DU CODE DÉFAUT : ${code}**

🔍 **Signification officielle** :
${desc}

📋 **Causes racines les plus fréquentes à l'atelier** :
1. Défaillance du composant incriminé ou encrassement calamine.
2. Faisceau électrique coupé, oxydé ou faux contact au connecteur.
3. Valeur de mesure en décalage par rapport à la consigne demandée par l'ECU.

🔧 **Conseil d'intervention MOTORS 2L** :
Ne changez pas la pièce à l'aveugle ! Un passage avec notre valise de diagnostic multimarques en atelier permet de tester les actionneurs en temps réel et de vérifier le câblage à l'oscilloscope.`;
}

function getMotorcycleDiagnosis(p, raw) {
  return `🏍️ **EXPERTISE MOTOS, SCOOTERS & 2-ROUES MOTORISÉS** :
- **Démarrage difficile à froid / Ratés de carburation** : Gicleurs de ralenti bouchés par les dépôts d'essence SP95-E10, membrane de dépression percée ou starter automatique grippé.
- **Régulateur / Redresseur de tension (panne classique Honda/Yamaha)** : Surchauffe du régulateur faisant bouillir la batterie avec tension de charge dépassant 15.5V.
- **Transmission par variateur (Scooter / TMAX)** : Usure des galets à méplat, joue fixe creusée ou courroie d'entraînement sous la côte limite de largeur.
- **Embrayage moto à bain d'huile** : Patinage lors de l'accélération en rapport supérieur dû à une huile inadaptée sans norme JASO MA2.
👉 Révision, diagnostic allumage/injection et entretien complet moto chez **MOTORS 2L**.`;
}

function getUtilityVehicleDiagnosis(p, raw) {
  return `🚐 **EXPERTISE UTILITAIRES & FOURGONS PROFESSIONNELS** (Master, Sprinter, Crafter, Transit...) :
- **Usage intensif et charges lourdes** : Usure accélérée des suspensions à lames, silentblocs de tirants de pont arrière et roulements de roues renforcés.
- **Perte de puissance en côte (mode dégradé)** : Fuite sur l'échangeur de suralimentation (intercooler gonflé ou fendu par la pression) ou capteur de pression de turbo encrassé.
- **Embrayage utilitaire** : Forte sollicitation des garnitures au démarrage en charge, contrôle du jeu du volant moteur bi-masse.
👉 Service pro avec pont élévateur haute capacité chez **MOTORS 2L** pour limiter l'immobilisation de votre outil de travail !`;
}

function getEvHybridDiagnosis(p, raw) {
  return `⚡ **EXPERTISE VÉHICULES ÉLECTRIQUES & HYBRIDES (VE/VH)** :
- **Batterie auxiliaire 12V** : Sur les véhicules électriques, 80% des pannes de démarrage ou "système électrique défaillant" proviennent de la batterie 12V de servitude et non de la batterie de traction haute tension !
- **Circuit de refroidissement batterie haute tension** : Pompe à eau électrique dédiée au liquide diélectrique/glycol en panne provoquant le bridage de la vitesse de charge rapide DC.
- **Isolation haute tension (défaut d'isolement)** : Fuite de courant détectée par le contrôleur d'isolement (compresseur de climatisation haute tension ou réchauffeur CTP fuyant à la masse).
👉 Techniciens habilités B2VL / BCL chez **MOTORS 2L** pour intervenir en toute sécurité sur circuits haute tension.`;
}

function broadcastOnlineUsers() {
  const users = Array.from(onlineUsers.values());
  const userMap = new Map();
  for (const u of users) {
    if (!userMap.has(u.id)) {
      userMap.set(u.id, { ...u });
    } else {
      if (u.busy) userMap.get(u.id).busy = true;
    }
  }

  // Always keep Assistant IA in online users
  const aiUser = db.prepare("SELECT id, username, avatar_color, role FROM users WHERE username = 'Assistant IA'").get();
  if (aiUser && !userMap.has(aiUser.id)) {
    userMap.set(aiUser.id, {
      id: aiUser.id,
      username: aiUser.username,
      avatar_color: aiUser.avatar_color,
      role: aiUser.role,
      busy: false,
      activeRoom: 'ai_room',
      isAi: true
    });
  }

  io.emit('online users', Array.from(userMap.values()));
}

function getRoomHistory(roomId, user) {
  if (!user) return [];

  const targetRoom = (!roomId || roomId === 'general') ? 'general' : roomId;

  // Récupérer la date de remise à zéro éventuelle de cet utilisateur pour cette discussion
  let clearedAt = null;
  try {
    const clearedRow = db.prepare('SELECT cleared_at FROM user_cleared_history WHERE user_id = ? AND room_id = ?').get(user.id, targetRoom);
    if (clearedRow && clearedRow.cleared_at) {
      clearedAt = clearedRow.cleared_at;
    }
  } catch(e) {}

  // 1. CANAL GÉNÉRAL (CHAT ALL)
  if (targetRoom === 'general') {
    if (user.role === 'admin') {
      // Compte Admin : voit tout sauf s'il a vidé son propre historique ou masqué des messages spécifiques
      if (clearedAt) {
        return db.prepare(`
          SELECT * FROM (
            SELECT m.id, m.user_id, m.username, m.content, m.media_url, m.media_type, m.room_id, m.created_at, u.avatar_color
            FROM messages m
            LEFT JOIN users u ON m.user_id = u.id
            WHERE (m.room_id IS NULL OR m.room_id = 'general')
              AND datetime(m.created_at) > datetime(?)
              AND m.id NOT IN (SELECT message_id FROM user_hidden_messages WHERE user_id = ?)
            ORDER BY m.created_at DESC
            LIMIT 300
          ) ORDER BY created_at ASC
        `).all(clearedAt, user.id);
      } else {
        return db.prepare(`
          SELECT * FROM (
            SELECT m.id, m.user_id, m.username, m.content, m.media_url, m.media_type, m.room_id, m.created_at, u.avatar_color
            FROM messages m
            LEFT JOIN users u ON m.user_id = u.id
            WHERE (m.room_id IS NULL OR m.room_id = 'general')
              AND m.id NOT IN (SELECT message_id FROM user_hidden_messages WHERE user_id = ?)
            ORDER BY m.created_at DESC
            LIMIT 300
          ) ORDER BY created_at ASC
        `).all(user.id);
      }
    } else {
      // Utilisateur standard : accès à l'historique du chat ALL à partir de son compte ou de son dernier vidage
      const userCreatedAt = user.created_at || '1970-01-01 00:00:00';
      const effectiveSince = (clearedAt && new Date(clearedAt) > new Date(userCreatedAt)) ? clearedAt : userCreatedAt;

      return db.prepare(`
        SELECT * FROM (
          SELECT m.id, m.user_id, m.username, m.content, m.media_url, m.media_type, m.room_id, m.created_at, u.avatar_color
          FROM messages m
          LEFT JOIN users u ON m.user_id = u.id
          WHERE (m.room_id IS NULL OR m.room_id = 'general')
            AND datetime(m.created_at) >= datetime(?)
            AND m.id NOT IN (SELECT message_id FROM user_hidden_messages WHERE user_id = ?)
          ORDER BY m.created_at DESC
          LIMIT 300
        ) ORDER BY created_at ASC
      `).all(effectiveSince, user.id);
    }
  }

  // 2. CONVERSATIONS PRIVÉES ET ASSISTANT IA
  if (clearedAt) {
    return db.prepare(`
      SELECT * FROM (
        SELECT m.id, m.user_id, m.username, m.content, m.media_url, m.media_type, m.room_id, m.created_at, u.avatar_color
        FROM messages m
        LEFT JOIN users u ON m.user_id = u.id
        WHERE m.room_id = ?
          AND datetime(m.created_at) > datetime(?)
          AND m.id NOT IN (SELECT message_id FROM user_hidden_messages WHERE user_id = ?)
        ORDER BY m.created_at DESC
        LIMIT 300
      ) ORDER BY created_at ASC
    `).all(targetRoom, clearedAt, user.id);
  } else {
    return db.prepare(`
      SELECT * FROM (
        SELECT m.id, m.user_id, m.username, m.content, m.media_url, m.media_type, m.room_id, m.created_at, u.avatar_color
        FROM messages m
        LEFT JOIN users u ON m.user_id = u.id
        WHERE m.room_id = ?
          AND m.id NOT IN (SELECT message_id FROM user_hidden_messages WHERE user_id = ?)
        ORDER BY m.created_at DESC
        LIMIT 300
      ) ORDER BY created_at ASC
    `).all(targetRoom, user.id);
  }
}

io.on('connection', (socket) => {
  const sess = socket.request.session;
  if (!sess || !sess.user) {
    socket.disconnect(true);
    return;
  }

  const user = sess.user;
  const currentSessionId = socket.request.sessionID;

  // Règle stricte anti-connexion simultanée : interdire si déjà connecté sur un autre appareil
  const otherDeviceSocket = Array.from(onlineUsers.entries()).find(
    ([sId, u]) => u.id === user.id && u.sessionID && u.sessionID !== currentSessionId
  );

  if (otherDeviceSocket) {
    console.log(`[Anti-MultiDevice] Connexion bloquée pour ${user.username} : compte déjà actif sur un autre appareil.`);
    socket.emit('device_conflict', {
      error: 'Ce compte est déjà connecté sur un autre appareil. La connexion simultanée est interdite.'
    });
    setTimeout(() => socket.disconnect(true), 100);
    return;
  }

  // Si c'est le même appareil qui recharge sa page (même sessionID, fermeture des anciens sockets fantômes)
  for (const [oldSockId, u] of onlineUsers.entries()) {
    if (u.id === user.id && oldSockId !== socket.id) {
      const oldSock = io.sockets.sockets.get(oldSockId);
      if (oldSock) oldSock.disconnect(true);
      onlineUsers.delete(oldSockId);
    }
  }

  // Récupérer le compte à jour avec sa date exacte de création
  const userDb = db.prepare('SELECT id, username, email, role, avatar_color, created_at FROM users WHERE id = ?').get(user.id);
  const currentUser = userDb || user;

  socket.join(`user_${currentUser.id}`);
  socket.join('general');

  onlineUsers.set(socket.id, {
    id: currentUser.id,
    username: currentUser.username,
    sessionID: currentSessionId,
    avatar_color: currentUser.avatar_color,
    role: currentUser.role,
    created_at: currentUser.created_at,
    busy: false,
    activeRoom: 'general'
  });

  socket.broadcast.emit('user joined', {
    username: currentUser.username,
    avatar_color: currentUser.avatar_color
  });

  broadcastOnlineUsers();

  // Envoi de l'historique du chat général (filtré selon rôle ou date de création du compte)
  socket.emit('chat history', {
    roomId: 'general',
    messages: getRoomHistory('general', currentUser)
  });

  // Notification à la connexion de l'administrateur des alertes en attente (affichage 10s)
  if (currentUser.role === 'admin') {
    try {
      const pendingAlerts = db.prepare(`
        SELECT id, from_user_id, from_username, message, created_at, status
        FROM offline_alerts
        WHERE status = 'unread'
        ORDER BY id ASC
      `).all();

      if (pendingAlerts.length > 0) {
        console.log(`[Admin] ${pendingAlerts.length} alerte(s) en attente transmises à l'admin ${currentUser.username}`);
        db.prepare(`UPDATE offline_alerts SET status = 'read' WHERE status = 'unread'`).run();
        socket.emit('admin pending alerts', { alerts: pendingAlerts });
      }
    } catch(err) {
      console.error('[Admin] Erreur lors de la vérification des alertes en attente:', err);
    }
  }

  socket.on('switch room', (data) => {
    const targetRoom = data && data.roomId ? data.roomId : 'general';
    const currentUserState = onlineUsers.get(socket.id);
    if (!currentUserState) return;

    if (currentUserState.activeRoom) {
      socket.leave(currentUserState.activeRoom);
    }
    socket.join(targetRoom);
    currentUserState.activeRoom = targetRoom;
    currentUserState.busy = targetRoom !== 'general' && !targetRoom.startsWith('ai_');

    broadcastOnlineUsers();

    // L'historique de la conversation sélectionnée reste conservé et est affiché
    const messages = getRoomHistory(targetRoom, currentUser);
    socket.emit('chat history', {
      roomId: targetRoom,
      messages
    });
  });

  socket.on('chat message', (data) => {
    const content = (data.content || '').trim();
    const mediaUrl = data.media_url || null;
    const mediaType = data.media_type || null;
    const roomId = data.roomId || 'general';

    if (!content && !mediaUrl) return;

    try {
      const result = db.prepare(`
        INSERT INTO messages (user_id, username, content, media_url, media_type, room_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(user.id, user.username, content, mediaUrl, mediaType, roomId);

      const message = {
        id: result.lastInsertRowid,
        user_id: user.id,
        username: user.username,
        content,
        media_url: mediaUrl,
        media_type: mediaType,
        room_id: roomId,
        avatar_color: user.avatar_color,
        created_at: new Date().toISOString()
      };

      io.to(roomId).emit('chat message', message);

      // Traitement IA : si room commence par 'ai_' OU si mentionne Assistant IA
      if (roomId.startsWith('ai_') || roomId.includes('ai')) {
        console.log(`[AI] Requête reçue dans la room ${roomId} : "${content}"`);
        const aiUser = db.prepare("SELECT id, username, avatar_color FROM users WHERE username = 'Assistant IA'").get();
        if (aiUser) {
          // Émettre immédiatement un indicateur "l'IA écrit..."
          io.to(roomId).emit('typing', { username: 'Assistant IA', roomId });

          (async () => {
            let aiResponseText = '';
            try {
              // Récupérer les derniers messages de la conversation pour le contexte Gemini
              const recentHistory = db.prepare(`
                SELECT username, content FROM messages
                WHERE room_id = ?
                ORDER BY id DESC LIMIT 6
              `).all(roomId).reverse();

              const geminiRes = await gemini.askGemini(content, recentHistory);
              if (geminiRes && geminiRes.success && geminiRes.reply) {
                aiResponseText = geminiRes.reply;
                console.log(`[AI] Réponse générée par Google Gemini (${geminiRes.model})`);
              } else {
                console.warn('[AI] Gemini non disponible, basculement sur le moteur expert local:', geminiRes ? geminiRes.error : '');
                aiResponseText = generateAutomotiveAiReply(content);
              }
            } catch (aiErr) {
              console.error('[AI] Erreur appel Gemini, basculement local:', aiErr);
              aiResponseText = generateAutomotiveAiReply(content);
            }

            // Arrêter l'animation "l'IA écrit..."
            io.to(roomId).emit('stop typing', { username: 'Assistant IA', roomId });

            try {
              const aiResult = db.prepare(`
                INSERT INTO messages (user_id, username, content, room_id)
                VALUES (?, ?, ?, ?)
              `).run(aiUser.id, aiUser.username, aiResponseText, roomId);

              const aiMsg = {
                id: aiResult.lastInsertRowid,
                user_id: aiUser.id,
                username: aiUser.username,
                content: aiResponseText,
                room_id: roomId,
                avatar_color: aiUser.avatar_color,
                created_at: new Date().toISOString()
              };

              console.log(`[AI] Réponse envoyée (${aiMsg.id}) dans ${roomId}`);
              io.to(roomId).emit('chat message', aiMsg);
            } catch (dbErr) {
              console.error('[AI] Erreur insertion DB réponse IA:', dbErr);
            }
          })();
        } else {
          console.error("[AI] Utilisateur 'Assistant IA' introuvable en base !");
        }
      }

      db.prepare("UPDATE users SET last_seen = datetime('now') WHERE id = ?").run(user.id);
    } catch (err) {
      console.error('[Socket] Error saving message:', err);
    }
  });

  socket.on('typing', (data) => {
    const roomId = (data && data.roomId) || 'general';
    socket.to(roomId).emit('typing', { username: user.username, roomId });
  });

  socket.on('stop typing', (data) => {
    const roomId = (data && data.roomId) || 'general';
    socket.to(roomId).emit('stop typing', { username: user.username, roomId });
  });

  socket.on('location update', (data) => {
    if (!data || typeof data.lat !== 'number' || typeof data.lng !== 'number') return;
    const loc = {
      lat: data.lat,
      lng: data.lng,
      accuracy: data.accuracy || null,
      username: user.username,
      avatar_color: user.avatar_color,
      updated_at: new Date().toISOString()
    };
    userLocations.set(user.id, loc);
    io.emit('location update', { userId: user.id, ...loc });
  });

  // --- WebRTC Live Vidéo (Multi-participants jusqu'à 4 & Contrôles Admin) ---

  // Démarrer ou rejoindre un Live Vidéo
  socket.on('start-live-call', (data) => {
    const roomId = data.roomId;
    if (!roomId) return;

    let live = activeLiveSessions.get(roomId);
    if (!live) {
      live = {
        roomId,
        adminId: user.role === 'admin' ? user.id : null,
        participants: new Map(),
        active: true,
        adminPresent: user.role === 'admin'
      };
      activeLiveSessions.set(roomId, live);
    }

    if (live.participants.size >= 4 && !live.participants.has(user.id)) {
      socket.emit('call-error', { message: 'Maximum 4 participants autorisés en même temps dans le live vidéo.' });
      return;
    }

    live.participants.set(user.id, {
      id: user.id,
      username: user.username,
      avatar_color: user.avatar_color,
      role: user.role
    });

    if (user.role === 'admin') {
      live.adminId = user.id;
      live.adminPresent = true;
    }

    socket.join(`live_${roomId}`);

    const participantsList = Array.from(live.participants.values());
    const existingPeers = participantsList.filter(p => p.id !== user.id);

    // Envoyer à l'utilisateur la liste des pairs déjà présents
    socket.emit('live-session-ready', {
      roomId,
      participants: participantsList,
      existingPeers,
      adminPresent: live.adminPresent,
      isAdmin: user.role === 'admin'
    });

    // Notifier les autres de son arrivée
    socket.to(`live_${roomId}`).emit('user-joined-live', {
      user: { id: user.id, username: user.username, avatar_color: user.avatar_color, role: user.role },
      totalParticipants: live.participants.size,
      participants: participantsList
    });

    // Si c'est un salon privé, faire sonner les autres participants du salon
    if (roomId.startsWith('private_')) {
      ensurePrivateRoomInitialized(roomId, user.id);
      const roomMembers = db.prepare('SELECT user_id FROM private_room_members WHERE room_id = ?').all(roomId);
      let targetIds = roomMembers.map(m => m.user_id).filter(id => id !== user.id);

      if (targetIds.length === 0) {
        const parts = roomId.split('_');
        if (parts.length >= 3) {
          const u1 = parseInt(parts[1], 10);
          const u2 = parseInt(parts[2], 10);
          if (u1 !== user.id && !isNaN(u1)) targetIds.push(u1);
          if (u2 !== user.id && !isNaN(u2)) targetIds.push(u2);
        }
      }

      for (const targetId of targetIds) {
        if (!live.participants.has(targetId)) {
          socket.to(`user_${targetId}`).emit('incoming-call', {
            callerId: user.id,
            callerName: user.username,
            callerAvatar: user.avatar_color,
            roomId: roomId,
            isGroupLive: true,
            totalParticipants: live.participants.size
          });
        }
      }
    }
  });

  // Invitation d'un autre membre au live (SEUL L'ADMINISTRATEUR PEUT INVITER, MAX 4 AU TOTAL)
  socket.on('invite-member-to-live', (data) => {
    if (user.role !== 'admin') {
      socket.emit('call-error', { message: 'Seul l\'administrateur a le droit d\'ajouter un membre au live vidéo.' });
      return;
    }

    const { roomId, targetUserId } = data;
    let live = activeLiveSessions.get(roomId);
    if (!live) {
      live = {
        roomId,
        adminId: user.id,
        participants: new Map([[user.id, { id: user.id, username: user.username, avatar_color: user.avatar_color, role: user.role }]]),
        active: true,
        adminPresent: true
      };
      activeLiveSessions.set(roomId, live);
    }

    if (live.participants.size >= 4) {
      socket.emit('call-error', { message: 'Limite maximale de 4 participants en même temps dans le live atteinte.' });
      return;
    }

    // Émettre l'appel entrant vers le membre ciblé
    socket.to(`user_${targetUserId}`).emit('incoming-call', {
      callerId: user.id,
      callerName: user.username,
      callerAvatar: user.avatar_color,
      roomId: roomId,
      isGroupLive: true,
      totalParticipants: live.participants.size
    });
  });

  // Signalisation WebRTC Mesh entre pairs (Peer-to-Peer 1-à-1 parmi les 4)
  socket.on('peer-signal', (data) => {
    socket.to(`user_${data.targetUserId}`).emit('peer-signal', {
      fromUserId: user.id,
      fromUsername: user.username,
      fromAvatar: user.avatar_color,
      signalData: data.signalData,
      isOffer: data.isOffer
    });
  });

  socket.on('peer-ice-candidate', (data) => {
    socket.to(`user_${data.targetUserId}`).emit('peer-ice-candidate', {
      fromUserId: user.id,
      candidate: data.candidate
    });
  });

  // L'ADMINISTRATEUR QUITTE TEMPORAIREMENT LE LIVE (LE LIVE CONTINUE SANS S'ARRÊTER)
  socket.on('admin-leave-live-temp', (data) => {
    if (user.role !== 'admin') return;
    const { roomId } = data;
    const live = activeLiveSessions.get(roomId);

    if (live) {
      live.adminPresent = false;
      live.participants.delete(user.id);
      socket.leave(`live_${roomId}`);

      const remainingParticipants = Array.from(live.participants.values());
      // Notifier les participants restants que l'admin s'est absenté temporairement, la communication continue !
      io.to(`live_${roomId}`).emit('admin-left-live-temp', {
        message: "L'administrateur s'est absenté temporairement. Le live vidéo continue.",
        participants: remainingParticipants,
        totalParticipants: remainingParticipants.length
      });

      // Permettre à l'admin de réintégrer à tout instant
      socket.emit('admin-live-standby', {
        roomId,
        participantsCount: remainingParticipants.length
      });
    }
  });

  // L'ADMINISTRATEUR RÉINTÈGRE LE LIVE EN COURS
  socket.on('admin-rejoin-live', (data) => {
    if (user.role !== 'admin') return;
    const { roomId } = data;
    const live = activeLiveSessions.get(roomId);
    if (!live || !live.active) {
      socket.emit('call-error', { message: 'Ce live n\'est plus actif.' });
      return;
    }

    live.adminPresent = true;
    live.participants.set(user.id, { id: user.id, username: user.username, avatar_color: user.avatar_color, role: user.role });
    socket.join(`live_${roomId}`);

    const participantsList = Array.from(live.participants.values());
    const existingPeers = participantsList.filter(p => p.id !== user.id);

    socket.emit('live-session-ready', {
      roomId,
      participants: participantsList,
      existingPeers,
      adminPresent: true,
      isAdmin: true
    });

    socket.to(`live_${roomId}`).emit('admin-rejoined-live', {
      user: { id: user.id, username: user.username, avatar_color: user.avatar_color, role: user.role },
      totalParticipants: live.participants.size,
      participants: participantsList
    });
  });

  // L'ADMINISTRATEUR MET FIN DÉFINITIVEMENT AU LIVE POUR TOUT LE MONDE
  socket.on('end-live-for-all', (data) => {
    if (user.role !== 'admin') return;
    const { roomId } = data;
    const live = activeLiveSessions.get(roomId);

    if (live) {
      io.to(`live_${roomId}`).emit('live-ended-by-admin', {
        message: "L'administrateur a mis fin au live vidéo pour tout le monde."
      });
      activeLiveSessions.delete(roomId);
    }
  });

  // Un membre quitte le live individuellement
  socket.on('leave-live-call', (data) => {
    const { roomId } = data;
    const live = activeLiveSessions.get(roomId);

    if (live) {
      live.participants.delete(user.id);
      socket.leave(`live_${roomId}`);

      io.to(`live_${roomId}`).emit('user-left-live', {
        userId: user.id,
        username: user.username,
        totalParticipants: live.participants.size,
        participants: Array.from(live.participants.values())
      });

      if (live.participants.size === 0) {
        activeLiveSessions.delete(roomId);
      }
    }
  });

  // Compatibilité WebRTC 1-à-1 existant
  socket.on('call-user', (data) => {
    socket.to(`user_${data.targetUserId}`).emit('incoming-call', {
      callerId: user.id,
      callerName: user.username,
      callerAvatar: user.avatar_color,
      roomId: data.roomId,
      isGroupLive: true,
      signalData: data.signalData || null
    });
  });

  socket.on('answer-call', (data) => {
    socket.to(`user_${data.targetUserId}`).emit('call-accepted', {
      signalData: data.signalData,
      fromUserId: user.id
    });
  });

  socket.on('ice-candidate', (data) => {
    socket.to(`user_${data.targetUserId}`).emit('ice-candidate', {
      candidate: data.candidate,
      fromUserId: user.id
    });
  });

  socket.on('end-call', (data) => {
    if (data && data.targetUserId) {
      socket.to(`user_${data.targetUserId}`).emit('call-ended', { fromUserId: user.id });
    }
  });

  socket.on('disconnect', (reason) => {
    console.log(`[Socket] Déconnexion temporaire de ${user.username} (${reason})`);
    onlineUsers.delete(socket.id);

    // Temporisation de 25 secondes avant de déclarer le départ définitif (tolérance mise en veille smartphone)
    setTimeout(() => {
      const stillOnline = Array.from(onlineUsers.values()).some(u => u.id === user.id);
      if (!stillOnline) {
        userLocations.delete(user.id);
        io.emit('location remove', { userId: user.id });
        socket.broadcast.emit('user left', { username: user.username });
        broadcastOnlineUsers();
        try {
          db.prepare("UPDATE users SET last_seen = datetime('now') WHERE id = ?").run(user.id);
        } catch(e) {}
      }
    }, 25000);
  });
});

const PORT = process.env.PORT || 3000;
const HTTPS_PORT = 3443;

// Serveur HTTP standard
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🔧 2LMotors HTTP démarré sur http://localhost:${PORT} et http://192.168.1.51:${PORT}`);
});

// Serveur HTTPS Sécurisé (Indispensable pour débloquer Micro & Caméra sur iPhone / Android)
const sslKeyPath = path.join(__dirname, 'ssl', 'key.pem');
const sslCertPath = path.join(__dirname, 'ssl', 'cert.pem');

if (fs.existsSync(sslKeyPath) && fs.existsSync(sslCertPath)) {
  const httpsServer = https.createServer({
    key: fs.readFileSync(sslKeyPath),
    cert: fs.readFileSync(sslCertPath)
  }, app);

  io.attach(httpsServer);

  httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
    console.log(`🔒 2LMotors HTTPS Sécurisé : https://192.168.1.51:${HTTPS_PORT}`);
    console.log(`   👉 Utilisez cette adresse HTTPS sur votre smartphone pour débloquer Micro & Caméra !\n`);
  });
}





