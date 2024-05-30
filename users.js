import { Router } from 'express';
import pkg from 'pg';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { validateToken } from './middlewares/AuthMiddleware.js';
import dotenv from "dotenv";
dotenv.config();
const { Client } = pkg;
const router = Router();

const db = new Client({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});

db.connect()
  .then(() => console.log('Connected to the database'))
  .catch(err => console.error('Error connecting to the database:', err));

const createUserTableQuery = `
  CREATE TABLE IF NOT EXISTS new_users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL
  );
`;

db.query(createUserTableQuery)
  .then(() => console.log('User table created successfully'))
  .catch(err => console.error('Error creating user table:', err));

router.get('/users', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM new_users');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).send('Server error');
  }
});

router.post('/users', async (req, res) => {
  const { email, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  try {
    const insertQuery = `
      INSERT INTO new_users (email, password)
      VALUES ($1, $2)
      RETURNING *;
    `;
    const result = await db.query(insertQuery, [email, hashedPassword]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error adding user:', err);
    res.status(500).send('Server error');
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const userResult = await db.query('SELECT * FROM new_users WHERE email = $1', [email]);
    const user = userResult.rows[0];

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const accessToken = jwt.sign({ email: user.email, id: user.id }, 'process.env.PG_SECRET', { expiresIn: '1h' });

    res.json({ token: accessToken, username: email, id: user.id });
  } catch (err) {
    console.error('Error during login:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/auth', validateToken, (req, res) => {
  res.json(req.user);
});

export default router;
