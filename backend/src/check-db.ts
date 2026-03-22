import { getPool } from './db';

const checkDatabase = async () => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT
        DB_NAME() AS database_name,
        @@SERVERNAME AS server_name
    `);

    console.log('Database connection OK');
    console.log(result.recordset[0]);
    process.exit(0);
  } catch (error) {
    console.error('Database connection failed');
    console.error(error);
    process.exit(1);
  }
};

void checkDatabase();
