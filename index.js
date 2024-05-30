import express from 'express';
import bodyParser from 'body-parser';
import pkg from 'pg';
import cors from 'cors';
import userRouter from './users.js';
import likeRouter from './likes.js';
import { validateToken } from './middlewares/AuthMiddleware.js';
import dotenv from 'dotenv';
dotenv.config();
const { Client } = pkg;

const app = express();
app.use(bodyParser.json());
app.use(cors());

const db = new Client({
  connectionString: process.env.POSTGRES_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

db.connect()
  .then(() => {
    console.log('Connected to the database.');
    const createPostsTableQuery = `
      CREATE TABLE IF NOT EXISTS posts (
        id_num SERIAL PRIMARY KEY,
        title VARCHAR(40) NOT NULL,
        post_text VARCHAR(100) NOT NULL,
        user_id INTEGER NOT NULL,
        user_name VARCHAR(100) NOT NULL,
        FOREIGN KEY (user_id) REFERENCES new_users(id) ON DELETE CASCADE
      );
    `;
    return db.query(createPostsTableQuery);
  })
  .then(() => {
    console.log('Posts table created successfully.');
    const createCommentsTableQuery = `
      CREATE TABLE IF NOT EXISTS comments (
        comment_id SERIAL PRIMARY KEY,
        post_id INTEGER NOT NULL,
        comment_text VARCHAR(255) NOT NULL,
        username VARCHAR(255) NOT NULL,
        FOREIGN KEY (post_id) REFERENCES posts(id_num) ON DELETE CASCADE
      );
    `;
    return db.query(createCommentsTableQuery);
  })
  .then(() => {
    console.log('Comments table created successfully.');
  })
  .catch(err => {
    console.error('Error creating tables:', err);
    process.exit(1);
  });

app.get('/post', async (req, res, next) => {
  try {
    const result = await db.query('SELECT * FROM posts');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching posts:', err);
    next(err);
  }
});

app.get('/byId/:id', async (req, res, next) => {
  const { id } = req.params;
  try {
    const postResult = await db.query('SELECT * FROM posts WHERE id_num = $1', [id]);
    if (postResult.rows.length === 0) {
      return res.status(404).send('Post not found');
    }
    const commentsResult = await db.query('SELECT * FROM comments WHERE post_id = $1', [id]);
    res.json({ post: postResult.rows[0], comments: commentsResult.rows });
  } catch (err) {
    console.error('Error fetching post:', err);
    next(err);
  }
});

app.post('/', validateToken, async (req, res, next) => {
  const { title, post_text } = req.body;
  const user_name = req.user.email; 
  const user_id = req.user.id; 

  if (!title || !post_text || !user_name || !user_id) {
    return res.status(400).send('Missing required fields');
  }

  try {
    const insertQuery = `
      INSERT INTO posts (title, post_text, user_id, user_name)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;
    const result = await db.query(insertQuery, [title, post_text, user_id, user_name]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error inserting post:', err);
    next(err);
  }
});

app.delete('/post/:postId', validateToken, async (req, res, next) => {
  const { postId } = req.params;

  try {
    const postQuery = 'SELECT * FROM posts WHERE id_num = $1';
    const postResult = await db.query(postQuery, [postId]);
    if (postResult.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const post = postResult.rows[0];
    if (post.user_name !== req.user.email) {
      return res.status(403).json({ error: 'You are not authorized to delete this post' });
    }

    const deleteQuery = 'DELETE FROM posts WHERE id_num = $1 RETURNING *';
    const deleteResult = await db.query(deleteQuery, [postId]);

    if (deleteResult.rowCount === 0) {
      return res.status(500).json({ error: 'Failed to delete post' });
    }

    res.json({ message: 'Post deleted successfully', post: deleteResult.rows[0] });
  } catch (err) {
    console.error('Error deleting post:', err);
    next(err);
  }
});

app.post('/comment', validateToken, async (req, res, next) => {
  const { post_id, comment_text } = req.body;
  const username = req.user.email; 

  if (!post_id || !comment_text) {
    return res.status(400).send('Missing required fields');
  }

  try {
    const insertQuery = `
      INSERT INTO comments (post_id, comment_text, username)
      VALUES ($1, $2, $3)
      RETURNING *;
    `;
    const result = await db.query(insertQuery, [post_id, comment_text, username]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error inserting comment:', err);
    next(err);
  }
});

app.delete('/comment/:commentId', validateToken, async (req, res, next) => {
  const { commentId } = req.params;

  try {
    const deleteQuery = 'DELETE FROM comments WHERE comment_id = $1 RETURNING *;';
    const result = await db.query(deleteQuery, [commentId]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    res.json({ message: 'Comment deleted successfully', comment: result.rows[0] });
  } catch (err) {
    console.error('Error deleting comment:', err);
    next(err);
  }
});

app.use('/api', userRouter);
app.use('/api', likeRouter);


app.get('/byUserId/:id', async (req, res, next) => {
  const { id } = req.params;
    const postsResult = await db.query(
      'SELECT p.* FROM posts p WHERE p.user_id = $1',
      [id]
    );

    if (postsResult.rows.length === 0) {
      return res.status(404).send('No posts found for this user');
    }

    const postsWithComments = await Promise.all(postsResult.rows.map(async (post) => {
      const commentsResult = await db.query('SELECT * FROM comments WHERE post_id = $1', [post.id_num]);
      return {
        ...post,
        comments: commentsResult.rows
      };
    }));

    res.json(postsWithComments);
  
  }
);

app.get('/basicinfo/:id', async (req, res) => {
  const id = req.params.id;

  try {
    const result = await db.query('SELECT * FROM new_users WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const basicInfo = result.rows[0];
    res.json(basicInfo);
  } catch (err) {
    console.error('Error fetching user basic info:', err);
    res.status(500).send('Server error');
  }
});
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});


app.put('/posts/title', validateToken, async (req, res, next) => {
  const { newtitle, id } = req.body;

  if (!newtitle || !id) {
    return res.status(400).send('Missing required fields');
  }

  try {
    const updateQuery = 'UPDATE posts SET title = $1 WHERE id_num = $2 RETURNING *';
    const result = await db.query(updateQuery, [newtitle, id]);

    if (result.rowCount === 0) {
      return res.status(404).send('Post not found');
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating post title:', err);
    next(err);
  }
});

app.put('/posts/text', validateToken, async (req, res, next) => {
  const { newtext, id } = req.body;

  if (!newtext || !id) {
    return res.status(400).send('Missing required fields');
  }

  try {
    const updateQuery = 'UPDATE posts SET post_text = $1 WHERE id_num = $2 RETURNING *';
    const result = await db.query(updateQuery, [newtext, id]);

    if (result.rowCount === 0) {
      return res.status(404).send('Post not found');
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating post text:', err);
    next(err);
  }
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    db.end().then(() => {
      console.log('Database connection closed');
      process.exit(0);
    }).catch(err => {
      console.error('Error closing database connection:', err);
      process.exit(1);
    });
  });
});


const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});
