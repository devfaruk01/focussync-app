const express = require('express');
const Session = require('../models/Session');

const router = express.Router();

router.get('/overview', (req, res) => {
  const userId = req.userId || 'anonymous';
  const overview = Session.getOverview(userId);

  return res.json(overview);
});

module.exports = router;
