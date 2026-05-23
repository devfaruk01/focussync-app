function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';

  if (!header.startsWith('Bearer ')) {
    req.userId = 'anonymous';
    return next();
  }

  const token = header.replace('Bearer ', '').trim();
  if (!token.startsWith('user-')) {
    return res.status(401).json({ error: 'Invalid token format' });
  }

  req.userId = token.slice(5) || 'anonymous';
  return next();
}

module.exports = authMiddleware;
