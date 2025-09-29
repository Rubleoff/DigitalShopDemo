const { query, pool } = require('./connection');

class UserService {
    static async unsleepQuery(){
        try {
            const result = await pool.query(`SELECT 1;`);
            console.log(`✅ Запрос для просыпания`);
        } catch (error) {
            if (error.code === '23505') { // unique constraint violation
                console.log(`⚠️ Ошибка`);
                return;
            }
            throw error;
        }
    }
    static async createUser(telegramUser) {
        await UserService.unsleepQuery();
        const sql = `
            INSERT INTO users (telegram_id, username, first_name, last_name, language_code)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *;
        `;

        const values = [
            telegramUser.id,
            telegramUser.username || null,
            telegramUser.first_name || null,
            telegramUser.last_name || null,
            telegramUser.language_code || null
        ];

        try {
            const result = await query(sql, values);
            console.log(`✅ Пользователь создан: ID ${result.rows[0].id}, Telegram ID: ${telegramUser.id}`);
            return result.rows[0];
        } catch (error) {
            if (error.code === '23505') { // unique constraint violation
                console.log(`⚠️ Пользователь ${telegramUser.id} уже существует`);
                return await this.updateUser(telegramUser);
            }
            throw error;
        }
    }

    static async updateUser(telegramUser) {
        await UserService.unsleepQuery();
        const sql = `
            UPDATE users 
            SET username = $2, 
                first_name = $3, 
                last_name = $4, 
                language_code = $5,
                last_activity = CURRENT_TIMESTAMP,
                is_active = TRUE
            WHERE telegram_id = $1
            RETURNING *;
        `;

        const values = [
            telegramUser.id,
            telegramUser.username || null,
            telegramUser.first_name || null,
            telegramUser.last_name || null,
            telegramUser.language_code || null
        ];

        try {
            const result = await query(sql, values);
            if (result.rows.length > 0) {
                console.log(`✅ Пользователь обновлен: Telegram ID ${telegramUser.id}`);
                return result.rows[0];
            } else {
                console.log(`⚠️ Пользователь ${telegramUser.id} не найден для обновления`);
                return null;
            }
        } catch (error) {
            console.error('❌ Ошибка обновления пользователя:', error);
            throw error;
        }
    }

    static async createOrUpdateUser(telegramUser) {
        await UserService.unsleepQuery();
        console.log(`🔄 Обработка пользователя: ${telegramUser.id} (@${telegramUser.username || 'без username'})`);

        // Сначала пытаемся найти пользователя
        const existingUser = await this.getUserByTelegramId(telegramUser.id);

        if (existingUser) {
            return await this.updateUser(telegramUser);
        } else {
            return await this.createUser(telegramUser);
        }
    }

    static async getUserByTelegramId(telegramId) {
        await UserService.unsleepQuery();
        const sql = 'SELECT * FROM users WHERE telegram_id = $1';

        try {
            const result = await query(sql, [telegramId]);
            return result.rows.length > 0 ? result.rows[0] : null;
        } catch (error) {
            console.error('❌ Ошибка получения пользователя:', error);
            throw error;
        }
    }

    static async getActiveUsers() {
        await UserService.unsleepQuery();
        const sql = `
            SELECT telegram_id, username, first_name, last_name
            FROM users
            WHERE is_active = TRUE AND is_blocked = FALSE
            ORDER BY last_activity DESC
        `;

        try {
            const result = await query(sql);
            return result.rows;
        } catch (error) {
            console.error('❌ Ошибка получения активных пользователей:', error);
            throw error;
        }
    }

    static async getUserStats() {
        await UserService.unsleepQuery();
        const sql = `
            SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN is_active = TRUE AND is_blocked = FALSE THEN 1 END) as active,
                COUNT(CASE WHEN is_blocked = TRUE THEN 1 END) as blocked,
                COUNT(CASE WHEN registration_date >= CURRENT_DATE THEN 1 END) as today_new
            FROM users;
        `;

        try {
            const result = await query(sql);
            const stats = result.rows[0];
            return {
                total: parseInt(stats.total),
                active: parseInt(stats.active),
                blocked: parseInt(stats.blocked),
                todayNew: parseInt(stats.today_new)
            };
        } catch (error) {
            console.error('❌ Ошибка получения статистики:', error);
            throw error;
        }
    }
}

module.exports = { UserService };