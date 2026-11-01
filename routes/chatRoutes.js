const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAuth } = require('../auth');

// GET /api/messages?limit=50
router.get('/', requireAuth, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  try {
    const messages = db.prepare(`
      SELECT m.id, m.user_id, m.username, m.content, m.created_at,
             u.avatar_color
      FROM messages m
      LEFT JOIN users u ON m.user_id = u.id
      ORDER BY m.created_at DESC
      LIMIT ?
    `).all(limit);

    // Reverse to get chronological order
    messages.reverse();
    res.json({ messages });
  } catch (err) {
    console.error('[Chat] Error fetching messages:', err);
    res.status(500).json({ error: 'Erreur lors du chargement des messages.' });
  }
});

// POST /api/messages/:id/hide-for-me (Effacer un message de son propre historique)
router.post('/:id/hide-for-me', requireAuth, (req, res) => {
  const messageId = parseInt(req.params.id);
  const userId = req.session.user.id;

  if (!messageId || isNaN(messageId)) {
    return res.status(400).json({ error: 'ID de message invalide.' });
  }

  try {
    db.prepare(`
      INSERT OR IGNORE INTO user_hidden_messages (user_id, message_id)
      VALUES (?, ?)
    `).run(userId, messageId);

    res.json({ success: true, message: 'Message effacé de votre historique personnel.' });
  } catch (err) {
    console.error('[Chat] Error hiding message for user:', err);
    res.status(500).json({ error: 'Erreur lors du masquage du message.' });
  }
});

// POST /api/messages/clear-my-history (Vider tout son historique pour un salon / chat all)
router.post('/clear-my-history', requireAuth, (req, res) => {
  const userId = req.session.user.id;
  const roomId = req.body.roomId || 'general';

  try {
    db.prepare(`
      INSERT INTO user_cleared_history (user_id, room_id, cleared_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(user_id, room_id) DO UPDATE SET cleared_at = datetime('now')
    `).run(userId, roomId);

    res.json({
      success: true,
      roomId,
      message: 'Votre historique pour cette discussion a été entièrement vidé.'
    });
  } catch (err) {
    console.error('[Chat] Error clearing user room history:', err);
    res.status(500).json({ error: 'Erreur lors du vidage de votre historique.' });
  }
});

module.exports = router;
