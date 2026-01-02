import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";
const { Pool } = pkg;
import * as schema from "@shared/schema";

// Database connection pool using environment variables
// These are set automatically by Replit's PostgreSQL or can be configured via .env
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Export the drizzle database instance
export const db = drizzle(pool, { schema });

// Export pool for raw queries and health checks
export { pool };

// Test database connection
export async function testConnection(): Promise<{ success: boolean; message: string }> {
  try {
    const client = await pool.connect();
    const result = await client.query("SELECT NOW() as current_time, version() as version");
    client.release();
    return {
      success: true,
      message: `Connected to PostgreSQL. Server time: ${result.rows[0].current_time}`,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unknown database error",
    };
  }
}

// Initialize database tables
export async function initializeDatabase(): Promise<void> {
  // Tables will be created via Drizzle migrations
  // This function can be used for any startup initialization
  console.log("[db] Database initialized");
}
