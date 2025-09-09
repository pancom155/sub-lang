function authMiddleware(req, res, next) {
  if (req.session && req.session.user) {
    req.user = req.session.user;
    return next();
  }
  return res.status(401).json({ error: 'You must be logged in to access this route.' });
}

module.exports = authMiddleware;
