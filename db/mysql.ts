import mysql, {
  type Pool,
  type PoolConnection,
  type ResultSetHeader,
  type RowDataPacket,
} from 'mysql2/promise';

export type MySqlResult<T = Record<string, unknown>> = {
  success: true;
  results: T[];
  meta: { changes: number; last_row_id: number };
};

export function createPool(url = process.env.DATABASE_URL): Pool {
  if (!url) throw new Error('请在 .env 配置 MySQL 8 的 DATABASE_URL');
  const parsed = new URL(url);
  if (parsed.protocol !== 'mysql:' || !parsed.pathname.slice(1))
    throw new Error('DATABASE_URL 必须为带库名的 mysql:// 连接地址');
  return mysql.createPool({
    uri: url,
    charset: 'utf8mb4',
    connectionLimit: Number(process.env.MYSQL_POOL_SIZE || 10),
    waitForConnections: true,
    queueLimit: 100,
    connectTimeout: 10000,
    supportBigNumbers: true,
    bigNumberStrings: false,
    decimalNumbers: true,
    multipleStatements: false,
    // A no-op conditional upsert must report zero, so leases cannot be stolen.
    flags: ['-FOUND_ROWS'],
    ...(process.env.MYSQL_SSL_CA
      ? { ssl: { ca: process.env.MYSQL_SSL_CA, rejectUnauthorized: true } }
      : {}),
  });
}

function databaseError(error: unknown, sql: string): Error {
  const e = error as { code?: string; sqlMessage?: string; message?: string };
  const table = sql.match(/(?:INTO|UPDATE|FROM)\s+`?(treasure_\w+)/i)?.[1];
  const legacy = table
    ?.replace(/^treasure_/, '')
    .replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
  if (e.code === 'ER_DUP_ENTRY')
    return new Error(`UNIQUE constraint failed: ${legacy}: ${e.sqlMessage}`);
  if (e.code === 'ER_BAD_NULL_ERROR') {
    const col = e.sqlMessage?.match(/Column '([^']+)'/)?.[1];
    return new Error(`NOT NULL constraint failed: ${legacy}.${col}`);
  }
  // mysql2's error.message can contain bound secret values; never propagate it.
  return new Error(e.sqlMessage || e.code || 'MySQL 操作失败');
}

export class MySqlStatement {
  readonly db: MySqlDatabase;
  readonly sql: string;
  readonly values: unknown[];
  readonly returnKey?: string;
  constructor(
    db: MySqlDatabase,
    sql: string,
    values: unknown[] = [],
    returnKey?: string,
  ) {
    this.db = db;
    this.sql = sql;
    this.values = values;
    this.returnKey = returnKey;
  }
  bind(...values: unknown[]) {
    return new MySqlStatement(this.db, this.sql, values, this.returnKey);
  }
  /** MySQL has no INSERT RETURNING; read insertId on the same connection. */
  returning(key: string) {
    if (!/^[A-Za-z_]\w*$/.test(key)) throw new Error('无效的返回键');
    return new MySqlStatement(this.db, this.sql, this.values, key);
  }
  async all<T = Record<string, unknown>>(): Promise<MySqlResult<T>> {
    return (await this.db.batch<T>([this]))[0];
  }
  async first<T = Record<string, unknown>>(column?: string): Promise<T | null> {
    const row = (await this.all<T>()).results[0];
    return row === undefined
      ? null
      : column
        ? ((row as Record<string, unknown>)[column] as T)
        : row;
  }
  async run<T = Record<string, unknown>>() {
    return this.all<T>();
  }
}

export class MySqlDatabase {
  readonly pool: Pool;
  constructor(pool: Pool) {
    this.pool = pool;
  }
  prepare(sql: string) {
    return new MySqlStatement(this, sql);
  }
  async batch<T = Record<string, unknown>>(
    statements: MySqlStatement[],
  ): Promise<MySqlResult<T>[]> {
    if (!statements.length) return [];
    if (statements.some((s) => s.db !== this))
      throw new Error('事务不能混用数据库连接');
    const write = statements.some((s) => !/^\s*SELECT\b/i.test(s.sql));
    const connection = await this.pool.getConnection();
    try {
      await connection.query(
        write
          ? 'SET TRANSACTION ISOLATION LEVEL READ COMMITTED'
          : 'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ',
      );
      await connection.beginTransaction();
      // Preserve serialized writers for queue slots, aggregate guards and leases.
      if (write)
        await connection.query(
          'SELECT id FROM treasure_transaction_lock WHERE id=1 FOR UPDATE',
        );
      const results: MySqlResult<T>[] = [];
      for (const statement of statements)
        results.push(await this.execute<T>(connection, statement));
      await connection.commit();
      return results;
    } catch (e) {
      await connection.rollback();
      throw e;
    } finally {
      connection.release();
    }
  }
  private async execute<T>(
    connection: PoolConnection,
    statement: MySqlStatement,
  ): Promise<MySqlResult<T>> {
    try {
      const [data] = await connection.query<RowDataPacket[] | ResultSetHeader>(
        statement.sql,
        statement.values,
      );
      if (Array.isArray(data))
        return {
          success: true,
          results: data as T[],
          meta: { changes: 0, last_row_id: 0 },
        };
      let results: T[] = [];
      if (statement.returnKey && data.affectedRows && data.insertId) {
        const table = statement.sql.match(
          /^\s*INSERT INTO\s+(treasure_\w+)/i,
        )?.[1];
        if (!table) throw new Error('只有 INSERT 可以读取新建记录');
        const [rows] = await connection.query<RowDataPacket[]>(
          `SELECT * FROM \`${table}\` WHERE \`${statement.returnKey}\`=?`,
          [data.insertId],
        );
        results = rows as T[];
      }
      const matched = /^\s*UPDATE\b/i.test(statement.sql)
        ? data.info?.match(/Rows matched: (\d+)/)?.[1]
        : undefined;
      return {
        success: true,
        results,
        meta: {
          changes: matched ? Number(matched) : data.affectedRows,
          last_row_id: data.insertId,
        },
      };
    } catch (e) {
      throw databaseError(e, statement.sql);
    }
  }
}

const shared = globalThis as typeof globalThis & {
  __treasureMysql?: MySqlDatabase;
};
export function database() {
  return (shared.__treasureMysql ??= new MySqlDatabase(createPool()));
}
