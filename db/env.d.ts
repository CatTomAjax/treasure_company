declare namespace NodeJS {
  interface ProcessEnv {
    DATABASE_URL?: string;
    MYSQL_POOL_SIZE?: string;
    MYSQL_SSL_CA?: string;
  }
}
