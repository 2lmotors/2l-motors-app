/**
 * Auth middleware for 2LMotors
 */

function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  return res.status(401).json({ error: 'Non authentifié. Veuillez vous connecter.' });
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'admin') {
    return next();
  }
  return res.status(403).json({ error: 'Accès refusé. Droits administrateur requis.' });
}

module.exports = { requireAuth, requireAdmin };
