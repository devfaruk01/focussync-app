const express = require('express');
const Session = require('../models/Session');
const Blocklist = require('../models/Blocklist');

const router = express.Router();

router.get('/state', (req, res) => {
  const userId = req.userId || 'anonymous';

  return res.json({
    sessions: Session.listByUser(userId),
    blocklist: Blocklist.getForUser(userId)
  });
});

router.post('/session', (req, res) => {
  const userId = req.userId || 'anonymous';
  const { durationSeconds, mode } = req.body || {};

  const session = Session.create({
    userId,
    durationSeconds,
    mode
  });

  return res.status(201).json({ session });
});

router.post('/blocklist', (req, res) => {
  const userId = req.userId || 'anonymous';
  const { domains } = req.body || {};

  const blocklist = Blocklist.setForUser(userId, domains);
  return res.json({ blocklist });
});

module.exports = router;
