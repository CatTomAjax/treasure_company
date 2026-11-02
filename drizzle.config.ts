import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './drizzle/mysql',
  schema: './db/schema.ts',
  dialect: 'mysql',
  dbCredentials: { url: process.env.DATABASE_URL || '' },
});
