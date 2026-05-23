const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

const { connectDatabase, getDatabaseStatus } = require('./config/database');
const authMiddleware = require('./middleware/auth');
const rateLimit = require('./middleware/rateLimit');

const authRoutes = require('./routes/auth');
const syncRoutes = require('./routes/sync');
const statsRoutes = require('./routes/stats');

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 37642;

app.use(cors());
app.use(express.json());
app.use(rateLimit({ windowMs: 60_000, max: 200 }));
app.use(authMiddleware);

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'focussync-backend',
    db: getDatabaseStatus()
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/stats', statsRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

if (require.main === module) {
  connectDatabase()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`FocusSync backend running on http://localhost:${PORT}`);
      });
    })
    .catch((error) => {
      console.error('Failed to start backend:', error);
      process.exit(1);
    });
}

module.exports = app;
