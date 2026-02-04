const { Pool } = require('pg')

const connectionString = process.env.DATABASE_URL || ''
const pool = new Pool({ connectionString, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false })

async function initDB() {
  const client = await pool.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        data JSONB,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
  } finally {
    client.release()
  }
}

async function getSession(id) {
  const res = await pool.query('SELECT data FROM sessions WHERE id=$1', [id])
  return res.rows[0] ? res.rows[0].data : null
}

async function saveSession(id, data) {
  await pool.query(`INSERT INTO sessions (id, data, updated_at) VALUES ($1, $2, NOW())\n    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()` , [id, data])
}

module.exports = { initDB, getSession, saveSession, pool }
