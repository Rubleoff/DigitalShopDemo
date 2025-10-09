const { query, pool } = require('./connection');

class AppService {

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
    static async addCategory(category) {
        await AppService.unsleepQuery();
        const sql = `
            INSERT INTO categories (id, name, image_path)
            VALUES ($1, $2, $3)
            RETURNING *;
        `;

        const values = [
            category.id,
            category.name,
            category.icon,
        ];

        try {
            const result = await query(sql, values);
            console.log(`✅ Категория создана: ${JSON.stringify(result.rows[0], null, 2)}`);
            return result.rows[0];
        } catch (error) {
            console.log(`⚠️ Ошибка добавления категории: ${category}`);
            throw error;
        }
    }

    static async addProduct(product) {
        await AppService.unsleepQuery();
        const sql = `
            INSERT INTO products (id, category_id, name, image_path, price, requires_password)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *;
        `;

        const values = [
            product.id,
            product.categoryId,
            product.name,
            product.image,
            product.price,
            product.requiresPassword,
        ];

        try {
            const result = await query(sql, values);
            console.log(`✅ Товар создан: ${JSON.stringify(result.rows[0], null, 2)}`);
            return result.rows[0];
        } catch (error) {
            console.log(`⚠️ Ошибка добавления товара: ${product}`);
            throw error;
        }
    }

    static async removeProduct(id) {
        await AppService.unsleepQuery();
        const sql = `DELETE FROM products WHERE id = $1`;
        const values = [id];

        try {
            const result = await query(sql, values);
            console.log(`✅ Товар удален: ${JSON.stringify(result.rows[0], null, 2)}`);
            return result.rows[0];
        } catch (error) {
            console.log(`⚠️ Ошибка удаления товара: ${id}`);
            throw error;
        }
    }

    static async removeCategory(id) {
        await AppService.unsleepQuery();
        const sql = `DELETE FROM categories WHERE id = $1`;
        const values = [id];

        try {
            const result = await query(sql, values);
            console.log(`✅ Категория удалена: ${JSON.stringify(result.rows[0], null, 2)}`);
            return result.rows[0];
        } catch (error) {
            console.log(`⚠️ Ошибка удаления категории: ${id}`);
            throw error;
        }
    }
}

module.exports = { AppService };