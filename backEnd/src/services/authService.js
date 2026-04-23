'use strict';

const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { pool } = require('../config/db');

const JWT_SECRET  = process.env.JWT_SECRET || 'kachaka-dev-secret';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '7d';

function makeError(message, httpStatus, code) {
  const err = new Error(message);
  err.httpStatus = httpStatus;
  if (code) err.code = code;
  return err;
}

async function register({ username, email, password, role = 'operator' }) {
  if (!username?.trim() || !email?.trim() || !password?.trim()) {
    throw makeError('username, email and password are required', 400);
  }
  if (password.length < 6) {
    throw makeError('Password must be at least 6 characters', 400);
  }
  const validRoles = ['admin', 'operator', 'viewer'];
  if (!validRoles.includes(role)) {
    throw makeError(`Role must be one of: ${validRoles.join(', ')}`, 400);
  }

  const hashed = await bcrypt.hash(password, 10);

  let rows;
  try {
    ({ rows } = await pool.query(
      `INSERT INTO users (username, email, password, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, email, role, created_at`,
      [username.trim(), email.trim().toLowerCase(), hashed, role]
    ));
  } catch (err) {
    if (err.message?.includes('UNIQUE')) {
      throw makeError('Username or email already exists', 409, 'DUPLICATE');
    }
    throw err;
  }

  return rows[0];
}

async function login({ email, password }) {
  if (!email?.trim() || !password?.trim()) {
    throw makeError('email and password are required', 400);
  }

  const { rows } = await pool.query(
    'SELECT * FROM users WHERE email = $1',
    [email.trim().toLowerCase()]
  );

  if (!rows.length) throw makeError('Invalid email or password', 401, 'INVALID_CREDENTIALS');

  const user = rows[0];
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) throw makeError('Invalid email or password', 401, 'INVALID_CREDENTIALS');

  const token = jwt.sign(
    { userId: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );

  return {
    token,
    user: { id: user.id, username: user.username, email: user.email, role: user.role },
  };
}

async function listUsers() {
  const { rows } = await pool.query(
    'SELECT id, username, email, role, created_at FROM users ORDER BY created_at DESC'
  );
  return rows;
}

async function deleteUser(id) {
  const { rows } = await pool.query('SELECT id, role FROM users WHERE id = $1', [id]);
  if (!rows.length) throw makeError('User not found', 404);
  if (rows[0].role === 'admin') throw makeError('Cannot delete admin accounts', 403, 'PROTECTED');
  await pool.query('DELETE FROM users WHERE id = $1', [id]);
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

module.exports = { register, login, listUsers, deleteUser, verifyToken };
