require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const hpp = require('hpp');

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'd7a8f9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8';
const IV_LENGTH = 16;

function encrypt(text) {
  if (!text) return text;
  let iv = crypto.randomBytes(IV_LENGTH);
  let key = crypto.createHash('sha256').update(String(ENCRYPTION_KEY)).digest('base64').substring(0, 32);
  let cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
  if (!text) return text;
  try {
    let textParts = text.split(':');
    if (textParts.length !== 2) return text;
    let iv = Buffer.from(textParts[0], 'hex');
    let encryptedText = Buffer.from(textParts[1], 'hex');
    let key = crypto.createHash('sha256').update(String(ENCRYPTION_KEY)).digest('base64').substring(0, 32);
    let decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (err) {
    return text;
  }
}


const app = express();
const port = process.env.PORT || 3000;

const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin123';

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});


app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300, message: { error: 'Too many requests' } });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Too many auth attempts' } });

app.use('/api/', apiLimiter);
app.use('/api/auth/', authLimiter);

app.use(cors());
app.use(express.json({ limit: '10kb' })); // Limit body payload to prevent DoS
app.use(hpp()); // Prevent HTTP Parameter Pollution
app.use(express.static(path.join(__dirname, './')));

// ──────────────────────────────────────────
// DB INIT + Admin Seed
// ──────────────────────────────────────────
const initDb = async () => {
  try {
    // Create tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        is_admin BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS vault_items (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        site_name TEXT NOT NULL,
        url TEXT,
        username TEXT,
        password TEXT,
        description TEXT,
        favorite BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Add is_admin columns if upgrading from old schema
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expiry TIMESTAMP;
    `);

    // Seed default admin user
    const adminExists = await pool.query('SELECT id FROM users WHERE username = $1', [ADMIN_USERNAME]);
    if (adminExists.rows.length === 0) {
      const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
      await pool.query(
        'INSERT INTO users (username, password_hash, is_admin) VALUES ($1, $2, TRUE)',
        [ADMIN_USERNAME, hash]
      );
      console.log(`✅ Admin user created — username: "${ADMIN_USERNAME}", password: "${ADMIN_PASSWORD}"`);
    } else {
      // Ensure existing admin has is_admin = true
      await pool.query('UPDATE users SET is_admin = TRUE WHERE username = $1', [ADMIN_USERNAME]);
    }

    console.log('Database initialized');
  } catch (err) {
    console.error('Error initializing database:', err);
  }
};

initDb();

// ──────────────────────────────────────────
// Admin Middleware
// ──────────────────────────────────────────
const requireAdmin = async (req, res, next) => {
  const userId = req.headers['user-id'];
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const result = await pool.query('SELECT is_admin FROM users WHERE id = $1', [userId]);
    if (result.rows.length === 0 || !result.rows[0].is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

// ──────────────────────────────────────────
// Auth Routes
// ──────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username, is_admin',
      [username, hashedPassword]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Username already exists' });
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });
    res.json({ id: user.id, username: user.username, is_admin: user.is_admin });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/change-password', async (req, res) => {
  const userId = req.headers['user-id'];
  const { new_password } = req.body;
  if (!userId || !new_password) return res.status(400).json({ error: 'Invalid request' });
  try {
    const hash = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, userId]);
    res.json({ message: 'Password updated' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Forgot Password Route
app.post('/api/auth/forgot-password', async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username required' });
  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) return res.json({ message: 'If the user exists, a reset link has been sent.' });
    
    const user = result.rows[0];
    if (!user.is_admin && username !== 'admin') {
       return res.status(403).json({ error: 'Only admin can reset password this way currently.' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    const expiry = new Date(Date.now() + 3600000);

    await pool.query('UPDATE users SET reset_token = $1, reset_token_expiry = $2 WHERE id = $3', [resetTokenHash, expiry, user.id]);

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.SMTP_USER || 'parmarsheri3@gmail.com',
        pass: process.env.SMTP_PASS || ''
      }
    });

    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const resetLink = `${protocol}://${req.get('host')}/?reset_token=${resetToken}&username=${username}`;

    await transporter.sendMail({
      from: '"Aura Vault" <no-reply@auravault.com>',
      to: 'parmarsheri3@gmail.com',
      subject: 'Aura Vault - Password Reset Request',
      text: `You requested a password reset. Click this link to reset your password: ${resetLink}\n\nIf you didn't request this, ignore this email. Link expires in 1 hour.`
    });

    res.json({ message: 'Password reset link sent to admin email.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to send email. Check SMTP settings in .env' });
  }
});

// Reset Password Confirm Route
app.post('/api/auth/reset-password-confirm', async (req, res) => {
  const { username, token, new_password } = req.body;
  if (!username || !token || !new_password) return res.status(400).json({ error: 'Invalid request' });
  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const result = await pool.query('SELECT * FROM users WHERE username = $1 AND reset_token = $2 AND reset_token_expiry > NOW()', [username, tokenHash]);
    
    if (result.rows.length === 0) return res.status(400).json({ error: 'Invalid or expired reset token.' });
    
    const user = result.rows[0];
    const passwordHash = await bcrypt.hash(new_password, 10);
    
    await pool.query('UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expiry = NULL WHERE id = $2', [passwordHash, user.id]);
    res.json({ message: 'Password reset successful. You can now login.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ──────────────────────────────────────────
// Admin Routes (protected)
// ──────────────────────────────────────────

// GET all users with their vault stats
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        u.id, u.username, u.is_admin, u.created_at,
        COUNT(v.id) AS total_items,
        COUNT(CASE WHEN v.type = 'password' THEN 1 END) AS passwords,
        COUNT(CASE WHEN v.type = 'link' THEN 1 END) AS links
      FROM users u
      LEFT JOIN vault_items v ON v.user_id = u.id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET global stats
app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  try {
    const users = await pool.query('SELECT COUNT(*) FROM users');
    const items = await pool.query('SELECT COUNT(*) FROM vault_items');
    const passwords = await pool.query("SELECT COUNT(*) FROM vault_items WHERE type = 'password'");
    const links = await pool.query("SELECT COUNT(*) FROM vault_items WHERE type = 'link'");
    res.json({
      total_users: parseInt(users.rows[0].count),
      total_items: parseInt(items.rows[0].count),
      total_passwords: parseInt(passwords.rows[0].count),
      total_links: parseInt(links.rows[0].count)
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE a user (admin cannot delete themselves)
app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  const adminId = req.headers['user-id'];
  const { id } = req.params;
  if (String(adminId) === String(id)) return res.status(400).json({ error: 'Cannot delete your own account' });
  try {
    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id, username', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ message: `User "${result.rows[0].username}" deleted` });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH reset a user's password
app.patch('/api/admin/users/:id/reset-password', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { new_password } = req.body;
  if (!new_password) return res.status(400).json({ error: 'new_password required' });
  try {
    const hash = await bcrypt.hash(new_password, 10);
    const result = await pool.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id, username',
      [hash, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ message: `Password reset for "${result.rows[0].username}"` });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH toggle admin status
app.patch('/api/admin/users/:id/toggle-admin', requireAdmin, async (req, res) => {
  const adminId = req.headers['user-id'];
  const { id } = req.params;
  if (String(adminId) === String(id)) return res.status(400).json({ error: 'Cannot change your own admin status' });
  try {
    const result = await pool.query(
      'UPDATE users SET is_admin = NOT is_admin WHERE id = $1 RETURNING id, username, is_admin',
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ──────────────────────────────────────────
// Vault Item Routes
// ──────────────────────────────────────────
app.get('/api/items', async (req, res) => {
  const userId = req.headers['user-id'];
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const result = await pool.query('SELECT * FROM vault_items WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/items', async (req, res) => {
  const userId = req.headers['user-id'];
  const { type, site_name, url, username, password, description } = req.body;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const result = await pool.query(
      'INSERT INTO vault_items (user_id, type, site_name, url, username, password, description) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [userId, type, site_name, url, username, password, description]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// IMPORTANT: /wipe must be before /:id
app.delete('/api/items/wipe', async (req, res) => {
  const userId = req.headers['user-id'];
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    await pool.query('DELETE FROM vault_items WHERE user_id = $1', [userId]);
    res.json({ message: 'Vault wiped' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/items/:id', async (req, res) => {
  const userId = req.headers['user-id'];
  const { id } = req.params;
  const { favorite, password: newPassword, site_name, url, username, description, type } = req.body;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const fields = [];
    const params = [];
    let count = 1;
    if (favorite !== undefined) { fields.push(`favorite = $${count++}`); params.push(favorite); }
    if (newPassword !== undefined) { fields.push(`password = ${count++}`); params.push(encrypt(newPassword)); }
    if (site_name !== undefined) { fields.push(`site_name = $${count++}`); params.push(site_name); }
    if (url !== undefined) { fields.push(`url = $${count++}`); params.push(url); }
    if (username !== undefined) { fields.push(`username = ${count++}`); params.push(encrypt(username)); }
    if (description !== undefined) { fields.push(`description = ${count++}`); params.push(encrypt(description)); }
    if (type !== undefined) { fields.push(`type = $${count++}`); params.push(type); }
    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
    const query = `UPDATE vault_items SET ${fields.join(', ')} WHERE id = $${count} AND user_id = $${count + 1} RETURNING *`;
    params.push(id, userId);
    const result = await pool.query(query, params);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Item not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/items/:id', async (req, res) => {
  const userId = req.headers['user-id'];
  const { id } = req.params;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const result = await pool.query('DELETE FROM vault_items WHERE id = $1 AND user_id = $2 RETURNING id', [id, userId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Item not found' });
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

module.exports = app;
