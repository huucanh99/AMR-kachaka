'use strict';

const { Router }   = require('express');
const authService  = require('../services/authService');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = Router();

function handleError(res, err) {
  console.error('[Auth]', err.message);
  res.status(err.httpStatus || 500).json({ success: false, error: err.message });
}

// POST /api/auth/register  — admin only
router.post('/register', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const user = await authService.register(req.body);
    res.status(201).json({ success: true, data: user });
  } catch (err) { handleError(res, err); }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const result = await authService.login(req.body);
    res.json({ success: true, data: result });
  } catch (err) { handleError(res, err); }
});

// GET /api/auth/me  — verify token + return current user info
router.get('/me', requireAuth, (req, res) => {
  res.json({ success: true, data: req.user });
});

// GET /api/auth/users  — admin only
router.get('/users', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const users = await authService.listUsers();
    res.json({ success: true, data: users });
  } catch (err) { handleError(res, err); }
});

// DELETE /api/auth/users/:id  — admin only
router.delete('/users/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    await authService.deleteUser(req.params.id);
    res.json({ success: true });
  } catch (err) { handleError(res, err); }
});

module.exports = router;
