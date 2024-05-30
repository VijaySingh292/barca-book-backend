import express from 'express';
import { validateToken } from './middlewares/AuthMiddleware.js'; 
import pkg from 'pg';
import dotenv from "dotenv";
dotenv.config();

const { Client } = pkg;
const router = express.Router();

const db = new Client({
  connectionString: process.env.POSTGRES_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

db.connect()
  .then(() => console.log('Connected to the database'))
  .catch(err => console.error('Error connecting to the database:', err));

const createLikesTableQuery = `
  CREATE TABLE IF NOT EXISTS likes (
    id SERIAL PRIMARY KEY,
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    FOREIGN KEY (post_id) REFERENCES posts(id_num) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES new_users(id) ON DELETE CASCADE,
    UNIQUE (post_id, user_id)
  );
`;

db.query(createLikesTableQuery)
  .then(() => console.log('Likes table created successfully'))
  .catch(err => console.error('Error creating likes table:', err));

const addLikeCountColumnQuery = `
  ALTER TABLE posts ADD COLUMN IF NOT EXISTS like_count INTEGER DEFAULT 0;
`;

db.query(addLikeCountColumnQuery)
  .then(() => console.log('Added like_count column to posts table'))
  .catch(err => console.error('Error adding like_count column:', err));

router.post('/like', validateToken, async (req, res) => {
  const { post_id } = req.body;
  const user_id = req.user.id;

  try {
    const checkQuery = `
      SELECT * FROM likes WHERE post_id = $1 AND user_id = $2;
    `;
    const checkResult = await db.query(checkQuery, [post_id, user_id]);

    if (checkResult.rows.length > 0) {
      return res.status(409).json({ error: "Post already liked" });
    }

    const insertQuery = `
      INSERT INTO likes (post_id, user_id)
      VALUES ($1, $2)
      RETURNING *;
    `;
    const result = await db.query(insertQuery, [post_id, user_id]);

    const updateQuery = `
      UPDATE posts
      SET like_count = like_count + 1
      WHERE id_num = $1;
    `;
    await db.query(updateQuery, [post_id]);

    res.json({ liked: true, like: result.rows[0] });
  } catch (err) {
    console.error('Error liking post:', err);
    res.status(500).json({ error: "Server error" });
  }
});

router.delete('/like', validateToken, async (req, res) => {
  const { post_id } = req.body;
  const user_id = req.user.id;

  try {
    const deleteQuery = `
      DELETE FROM likes
      WHERE post_id = $1 AND user_id = $2
      RETURNING *;
    `;
    const result = await db.query(deleteQuery, [post_id, user_id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Like not found" });
    }

    const updateQuery = `
      UPDATE posts
      SET like_count = like_count - 1
      WHERE id_num = $1;
    `;
    await db.query(updateQuery, [post_id]);

    res.json({ unliked: true, like: result.rows[0] });
  } catch (err) {
    console.error('Error unliking post:', err);
    res.status(500).json({ error: "Server error" });
  }
});


router.get('/liked-posts', validateToken, async (req, res) => {
  const user_id = req.user.id;

  try {
    const query = `
      SELECT posts.*
      FROM posts
      INNER JOIN likes ON posts.id_num = likes.post_id
      WHERE likes.user_id = $1;
    `;
    const result = await db.query(query, [user_id]);

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching liked posts:', err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
