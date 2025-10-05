const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DB_URL,
    ssl: {
        rejectUnauthorized: false // обязательно для Render!
    },
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