require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, './')));

// Database initialization
const initDb = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
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
    console.log('Database initialized');
  } catch (err) {
    console.error('Error initializing database:', err);
  }
};

initDb();

// Auth Routes
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username',
      [username, hashedPassword]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Username already exists' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    res.json({ id: user.id, username: user.username });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Vault Item Routes
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

app.put('/api/items/:id', async (req, res) => {
  const userId = req.headers['user-id'];
  const { id } = req.params;
  const { favorite, password: newPassword } = req.body;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    let query = 'UPDATE vault_items SET ';
    const params = [];
    let count = 1;

    if (favorite !== undefined) {
      query += `favorite = $${count++}, `;
      params.push(favorite);
    }
    if (newPassword !== undefined) {
      query += `password = $${count++}, `;
      params.push(newPassword);
    }

    query = query.slice(0, -2); // Remove trailing comma
    query += ` WHERE id = $${count} AND user_id = $${count + 1} RETURNING *`;
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

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
