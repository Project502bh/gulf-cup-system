const path = require('node:path');
const express = require('express');
const session = require('express-session');

const { runSeed } = require('./seed');
const authRoutes = require('./routes/auth');
const tournamentsRoutes = require('./routes/tournaments');
const systemRoutes = require('./routes/system');
const teamsRoutes = require('./routes/teams');
const playersRoutes = require('./routes/players');
const matchesRoutes = require('./routes/matches');
const statsRoutes = require('./routes/stats');
const dashboardRoutes = require('./routes/dashboard');
const auditRoutes = require('./routes/audit');
const usersRoutes = require('./routes/users');

const app = express();
const PORT = process.env.PORT || 4310;

// Auto-seed demo data on first boot (no-op if data already exists) so a freshly
// deployed instance with an empty/ephemeral disk works without manual setup.
runSeed();

app.use(express.json());
app.use(session({
  name: 'gulfcup.sid',
  secret: process.env.SESSION_SECRET || 'gulf-cup-dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 8 },
}));

app.use('/api/auth', authRoutes);
app.use('/api/tournaments', tournamentsRoutes);
app.use('/api/tournaments', systemRoutes);
app.use('/api/teams', teamsRoutes);
app.use('/api/players', playersRoutes);
app.use('/api/matches', matchesRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/users', usersRoutes);

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'غير موجود' });
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'حدث خطأ داخلي غير متوقع' });
});

app.listen(PORT, () => {
  console.log(`Gulf Cup Statistics System running at http://localhost:${PORT}`);
});
