const express = require('express');
const User = require('../models/User');

const router = express.Router();

router.post('/register', (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    const user = User.create({ name, email, password });

    return res.status(201).json({
      user: User.toSafeProfile(user),
      token: `user-${user.id}`
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = User.findByEmail(email);

  if (!user || user.password !== String(password || '')) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  return res.json({
    user: User.toSafeProfile(user),
    token: `user-${user.id}`
  });
});

router.get('/me', (req, res) => {
  const id = req.userId === 'anonymous' ? null : req.userId;
  if (!id) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const user = User.findById(id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  return res.json({ user: User.toSafeProfile(user) });
});

module.exports = router;
