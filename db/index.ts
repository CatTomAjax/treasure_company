import { drizzle } from 'drizzle-orm/mysql2';
import { database } from './mysql';
import * as schema from './schema';

export function getDb() {
  return drizzle(database().pool, { schema, mode: 'default' });
}
