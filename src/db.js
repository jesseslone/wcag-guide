import pg from "pg";

import { databaseUrl } from "./config.js";

const pool = new pg.Pool({
  connectionString: databaseUrl
});

export { pool };

export async function withTransaction(callback) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool() {
  await pool.end();
}
