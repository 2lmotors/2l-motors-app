const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAuth, requireAdmin } = require('../auth');

// All admin routes require auth + admin role
router.use(requireAuth, requireAdmin);

// GET /api/admin/users
router.get('/users', (req, res) => {
  try {
    const users = db.prepare(`
      SELECT u.id, u.username, u.email, u.phone, u.address, u.role, u.avatar_color, u.is_active, u.created_at, u.last_seen,
             (SELECT COUNT(*) FROM messages m WHERE m.user_id = u.id) as message_count
      FROM users u
      ORDER BY u.created_at DESC
    `).all();
    res.json({ users });
  } catch (err) {
    console.error('[Admin] Error fetching users:', err);
    res.status(500).json({ error: 'Erreur lors du chargement des utilisateurs.' });
  }
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', (req, res) => {
  const userId = parseInt(req.params.id);

  if (userId === req.session.user.id) {
    return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte.' });
  }

  try {
    const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur introuvable.' });
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    res.json({ success: true, message: `Utilisateur "${user.username}" supprimé.` });
  } catch (err) {
    console.error('[Admin] Error deleting user:', err);
    res.status(500).json({ error: 'Erreur lors de la suppression.' });
  }
});

// PUT /api/admin/users/:id/role
router.put('/users/:id/role', (req, res) => {
  const userId = parseInt(req.params.id);
  const { role } = req.body;

  if (!['user', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'Rôle invalide. Valeurs acceptées: user, admin.' });
  }
  if (userId === req.session.user.id) {
    return res.status(400).json({ error: 'Vous ne pouvez pas modifier votre propre rôle.' });
  }

  try {
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur introuvable.' });
    }

    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);
    res.json({ success: true, message: `Rôle mis à jour: ${role}` });
  } catch (err) {
    console.error('[Admin] Error updating role:', err);
    res.status(500).json({ error: 'Erreur lors de la mise à jour du rôle.' });
  }
});

// PUT /api/admin/users/:id/status
router.put('/users/:id/status', (req, res) => {
  const userId = parseInt(req.params.id);
  const { is_active } = req.body;

  if (typeof is_active !== 'boolean' && is_active !== 0 && is_active !== 1) {
    return res.status(400).json({ error: 'Valeur is_active invalide.' });
  }
  if (userId === req.session.user.id) {
    return res.status(400).json({ error: 'Vous ne pouvez pas modifier votre propre statut.' });
  }

  try {
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur introuvable.' });
    }

    const activeVal = is_active ? 1 : 0;
    db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(activeVal, userId);
    res.json({ success: true, message: `Compte ${activeVal ? 'activé' : 'désactivé'}.` });
  } catch (err) {
    console.error('[Admin] Error updating status:', err);
    res.status(500).json({ error: 'Erreur lors de la mise à jour du statut.' });
  }
});

// GET /api/admin/stats
router.get('/stats', (req, res) => {
  try {
    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    const activeUsers = db.prepare('SELECT COUNT(*) as count FROM users WHERE is_active = 1').get().count;
    const adminCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE role = \'admin\'').get().count;
    const totalMessages = db.prepare('SELECT COUNT(*) as count FROM messages').get().count;
    const todayMessages = db.prepare(
      'SELECT COUNT(*) as count FROM messages WHERE date(created_at) = date(\'now\')'
    ).get().count;

    res.json({
      stats: {
        totalUsers,
        activeUsers,
        adminCount,
        totalMessages,
        todayMessages
      }
    });
  } catch (err) {
    console.error('[Admin] Error fetching stats:', err);
    res.status(500).json({ error: 'Erreur lors du chargement des statistiques.' });
  }
});

// GET /api/admin/alerts (Historique des alertes reçues)
router.get('/alerts', (req, res) => {
  try {
    const alerts = db.prepare(`
      SELECT id, from_user_id, from_username, message, created_at, status
      FROM offline_alerts
      ORDER BY id DESC
    `).all();
    res.json({ alerts });
  } catch (err) {
    console.error('[Admin] Error fetching alerts:', err);
    res.status(500).json({ error: 'Erreur lors du chargement des alertes.' });
  }
});

// GET /api/admin/pending-alerts (Alertes non encore notifiées à l'administrateur)
router.get('/pending-alerts', (req, res) => {
  try {
    const unread = db.prepare(`
      SELECT id, from_user_id, from_username, message, created_at, status
      FROM offline_alerts
      WHERE status = 'unread'
      ORDER BY id ASC
    `).all();

    if (unread.length > 0) {
      db.prepare(`UPDATE offline_alerts SET status = 'read' WHERE status = 'unread'`).run();
    }

    res.json({ alerts: unread });
  } catch (err) {
    console.error('[Admin] Error fetching pending alerts:', err);
    res.status(500).json({ error: 'Erreur lors du chargement des alertes en attente.' });
  }
});

// DELETE /api/admin/alerts/:id (Suppression d'une alerte spécifique)
router.delete('/alerts/:id', (req, res) => {
  const alertId = parseInt(req.params.id);
  try {
    const result = db.prepare('DELETE FROM offline_alerts WHERE id = ?').run(alertId);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Alerte introuvable.' });
    }
    res.json({ success: true, message: 'Message supprimé avec succès.' });
  } catch (err) {
    console.error('[Admin] Error deleting alert:', err);
    res.status(500).json({ error: 'Erreur lors de la suppression de l\'alerte.' });
  }
});

// DELETE /api/admin/alerts (Suppression de toutes les alertes)
router.delete('/alerts', (req, res) => {
  try {
    db.prepare('DELETE FROM offline_alerts').run();
    try {
      db.prepare("DELETE FROM sqlite_sequence WHERE name = 'offline_alerts'").run();
    } catch(e) {}
    res.json({ success: true, message: 'Tous les messages d\'alerte ont été effacés.' });
  } catch (err) {
    console.error('[Admin] Error clearing all alerts:', err);
    res.status(500).json({ error: 'Erreur lors de la suppression de toutes les alertes.' });
  }
});

// POST /api/admin/stats/reset
router.post('/stats/reset', (req, res) => {
  try {
    db.prepare('DELETE FROM messages').run();
    try {
      db.prepare("DELETE FROM sqlite_sequence WHERE name = 'messages'").run();
    } catch(e) {}
    try {
      db.prepare('DELETE FROM offline_alerts').run();
      db.prepare("DELETE FROM sqlite_sequence WHERE name = 'offline_alerts'").run();
    } catch(e) {}

    res.json({
      success: true,
      message: 'Statistiques et messages remis à zéro avec succès.'
    });
  } catch (err) {
    console.error('[Admin] Error resetting stats:', err);
    res.status(500).json({ error: 'Erreur lors de la remise à zéro des statistiques.' });
  }
});

module.exports = router;

