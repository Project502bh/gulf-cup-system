const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { ROLE_LABELS } = require('../middleware/auth');
const { recordAudit } = require('../audit');

const router = express.Router();

const getUserByUsername = db.prepare('SELECT * FROM users WHERE username = ?');

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'الرجاء إدخال اسم المستخدم وكلمة المرور' });
  }
  const user = getUserByUsername.get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
  }
  req.session.user = {
    id: user.id,
    username: user.username,
    fullName: user.full_name,
    role: user.role,
    roleLabel: ROLE_LABELS[user.role],
  };
  recordAudit(req, { action: 'login', entity: 'session', entityId: user.id });
  res.json({ user: req.session.user });
});

router.post('/logout', (req, res) => {
  const user = req.session && req.session.user;
  if (user) recordAudit(req, { action: 'logout', entity: 'session', entityId: user.id });
  req.session.destroy(() => {
    res.clearCookie('gulfcup.sid');
    res.json({ ok: true });
  });
});

router.get('/me', (req, res) => {
  if (!req.session || !req.session.user) return res.status(401).json({ error: 'غير مصادق' });
  res.json({ user: req.session.user });
});

module.exports = router;
