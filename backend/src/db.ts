import type { ConnectionPool } from 'mssql';
import dotenv from 'dotenv';

dotenv.config();

type SqlModule = typeof import('mssql');
type DbConfig = import('mssql').config & {
  connectionString?: string;
  debug?: boolean;
};

const useWindowsAuth = process.env.DB_WINDOWS_AUTH === 'true';
const sql: SqlModule = useWindowsAuth ? require('mssql/msnodesqlv8') : require('mssql');
const dbHost = process.env.DB_HOST?.trim() || 'localhost';
const databaseName = process.env.DB_NAME?.trim() || 'poetry_db';
const instanceName = process.env.DB_INSTANCE?.trim() || undefined;
const configuredPortValue = process.env.DB_PORT?.trim();
const configuredPort = configuredPortValue ? Number(configuredPortValue) : undefined;
const debugEnabled = process.env.DB_DEBUG === 'true';
const allowLocalFallback = process.env.DB_ALLOW_LOCAL_FALLBACK === 'true';
const retryDelayMs = Number(process.env.DB_RETRY_DELAY_MS || 30000);
const connectionTimeoutMs = Number(process.env.DB_CONNECTION_TIMEOUT_MS || 4000);
const requestTimeoutMs = Number(process.env.DB_REQUEST_TIMEOUT_MS || 8000);
const dbUser = process.env.DB_USER?.trim();
const encryptConnection = process.env.DB_ENCRYPT === 'true';
const trustServerCertificate = process.env.DB_TRUST_SERVER_CERTIFICATE !== 'false';
const dbDriver = process.env.DB_DRIVER?.trim() || undefined;
const effectiveDriver = dbDriver || (useWindowsAuth ? 'ODBC Driver 18 for SQL Server' : undefined);
const connectionTarget = instanceName
  ? `${dbHost}\\${instanceName}`
  : configuredPort !== undefined && Number.isFinite(configuredPort)
    ? `${dbHost},${configuredPort}`
    : dbHost;

const config: DbConfig = {
  server: dbHost,
  database: databaseName,
  debug: debugEnabled,
  connectionTimeout: connectionTimeoutMs,
  requestTimeout: requestTimeoutMs,
  ...(effectiveDriver ? { driver: effectiveDriver } : {}),
  options: {
    encrypt: encryptConnection,
    trustServerCertificate,
    ...(useWindowsAuth ? { trustedConnection: true } : {}),
    ...(instanceName ? { instanceName } : {}),
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

if (useWindowsAuth) {
  const yesNo = (value: boolean) => (value ? 'Yes' : 'No');
  const driverName = effectiveDriver || 'ODBC Driver 18 for SQL Server';
  config.connectionString = [
    `Driver={${driverName}}`,
    `Server={${connectionTarget}}`,
    `Database={${databaseName}}`,
    'Trusted_Connection=Yes',
    `Encrypt=${yesNo(encryptConnection)}`,
    `TrustServerCertificate=${yesNo(trustServerCertificate)}`,
  ].join(';');
}

if (!useWindowsAuth && dbUser) {
  config.user = dbUser;
  config.password = process.env.DB_PASSWORD || '';
}

if (!instanceName && configuredPort !== undefined && Number.isFinite(configuredPort)) {
  config.port = configuredPort;
}

if (debugEnabled) {
  const safeConfig = {
    server: config.server,
    connectionTarget,
    database: config.database,
    port: config.port,
    instanceName,
    driver: config.driver,
    useWindowsAuth,
    hasConnectionString: Boolean(config.connectionString),
    encrypt: config.options?.encrypt,
    trustServerCertificate: config.options?.trustServerCertificate,
    hasUser: Boolean(config.user),
    allowLocalFallback,
    connectionTimeoutMs,
    requestTimeoutMs,
  };

  console.log('SQL Server config', safeConfig);
}

let poolPromise: Promise<ConnectionPool> | null = null;
let lastConnectionFailureAt = 0;
let lastConnectionError: unknown = null;

const shouldSkipDatabaseAttempt = () =>
  allowLocalFallback &&
  lastConnectionFailureAt > 0 &&
  Date.now() - lastConnectionFailureAt < retryDelayMs;

const getLastConnectionError = () => lastConnectionError;

const getPool = async () => {
  if (shouldSkipDatabaseAttempt()) {
    throw lastConnectionError ?? new Error('Database connection temporarily disabled after a recent failure');
  }

  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(config)
      .connect()
      .then((pool: ConnectionPool) => {
        lastConnectionFailureAt = 0;
        lastConnectionError = null;
        console.log('Connected to SQL Server');
        return pool;
      })
      .catch((error: unknown) => {
        poolPromise = null;
        lastConnectionFailureAt = Date.now();
        lastConnectionError = error;
        throw error;
      });
  }

  return poolPromise;
};

export { sql, config, getPool, allowLocalFallback, shouldSkipDatabaseAttempt, getLastConnectionError };
