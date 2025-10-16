const { query, pool } = require('./connection');
const {text} = require("express");

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

    static async getProducts(){
        try{
            return await pool.query(`
            SELECT 
                c.id as category_id,
                c.name as category_name,
                c.image_path as category_icon,
                COALESCE(
                    json_agg(
                        CASE WHEN p.id IS NOT NULL THEN
                            json_build_object(
                                'id', p.id,
                                'name', p.name,
                                'price', p.price,
                                'image', p.image_path,
                                'requiresPassword', p.requires_password
                            )
                        END
                        ORDER BY p.name
                    ) FILTER (WHERE p.id IS NOT NULL),
                    '[]'::json
                ) as products
            FROM categories c
            LEFT JOIN products p ON c.id = p.category_id
            GROUP BY c.id, c.name, c.image_path
            ORDER BY c.name
        `);
        }catch (error) {
            console.log(`⚠️ Ошибка получения продуктов`);
            throw error;
        }
    }

    static async getProductById(id){
        try{
            const sql =
                `SELECT 
                    p.id,
                    p.name AS product_name,
                    p.price,
                    p.image_path,
                    p.requires_password,
                    c.name AS category_name
                FROM products p
                JOIN categories c ON p.category_id = c.id
                WHERE p.id = $1;`;
            const values = [id];

            const result = await query(sql, values);
            console.log(`✅ Продукт получен: ${JSON.stringify(result.rows[0], null, 2)}`);
            return result.rows[0];
        }catch (error) {
            console.log(`⚠️ Ошибка получения продукта: ${id}`);
            throw error;
        }
    }

    static async addOrder(order){
        await AppService.unsleepQuery();
        const sql = `
            INSERT INTO orders (order_id, user_id, product_id, login, password, status, order_opened)
            VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
            RETURNING *;
        `;

        const values = [
            order.order_id,
            order.user_id,
            order.product_id,
            order.login,
            order.password,
            order.status,
        ];

        try {
            const result = await query(sql, values);
            console.log(`✅ Заказ создан: ${JSON.stringify(result.rows[0], null, 2)}`);
            return result.rows[0];
        } catch (error) {
            console.log(`⚠️ Ошибка добавления заказа: ${order}`);
            throw error;
        }
    }

    static async getOrdersByUserId(userId){
        try{
            const sql = `SELECT
                                         p.name,
                                         p.price,
                                         c.image_path AS image_path,
                                         o.status,
                                         o.order_opened,
                                         o.order_closed
                                     FROM orders o
                                              JOIN products p ON o.product_id = p.id
                                              JOIN categories c ON p.category_id = c.id
                                     WHERE o.user_id = $1`;
            const values = [userId]
            const result = await query(sql, values);
            console.log(result.rows);
            return result.rows;
        }catch (error) {
            console.log(`⚠️ Ошибка получения заказов`);
            throw error;
        }
    }

    static async getCategories(){
        try{
            return await pool.query(`SELECT id, name, image_path as icon FROM categories ORDER BY name`);
        }catch (error) {
            console.log(`⚠️ Ошибка получения продуктов`);
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