const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,

    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

pool.on('connect', () => {
    console.log('✅ Подключение к PostgreSQL установлено');
});

pool.on('error', (err) => {
    console.error('❌ Ошибка PostgreSQL:', err);
    process.exit(-1);
});

const getClient = async () => {
    return await pool.connect();
};

const query = async (text, params) => {
    const start = Date.now();
    try {
        const res = await pool.query(text, params);
        const duration = Date.now() - start;
        console.log(`🔍 SQL запрос выполнен за ${duration}ms:`, { text, rowCount: res.rowCount });
        return res;
    } catch (error) {
        console.error('❌ Ошибка SQL запроса:', error);
        throw error;
    }
};

module.exports = {
    query,
    getClient,
    pool
};