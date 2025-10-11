require('dotenv').config();

const cors = require('cors');
const crypto = require('crypto');


const {UserService}  = require('./database/userService');
const {AppService}  = require('./database/appService');

const {query, pool} = require('./database/connection.js');

const TelegramApi = require('node-telegram-bot-api');

const bot = new TelegramApi(process.env.BOT_TOKEN);

const express = require('express');

const app = express();
app.use(express.json());


// Webhook endpoint
app.post('/webhook', (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

app.use(cors({
    origin: [
        'https://firstapp-xodb.onrender.com',
        'https://localhost:3000', // для локальной разработки
        /^https:\/\/.*\.ngrok\.io$/, // старые ngrok домены
        /^https:\/\/.*\.ngrok-free\.app$/ // новые ngrok домены
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
        'Accept',
        'Accept-Version',
        'Content-Length',
        'Content-MD5',
        'Content-Type',
        'Date',
        'X-Api-Version',
        'Authorization',
        'ngrok-skip-browser-warning' // для пропуска предупреждения ngrok
    ],
    credentials: false
}));

function validateInitData(initData, botToken) {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return false;
    params.delete('hash');

    const dataCheckString = [...params.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v}`)
        .join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calc = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    const ok = calc === hash;
    const authDate = Number(params.get('auth_date') || 0);
    const fresh = authDate && (Date.now() / 1000 - authDate) < 86400;
    return ok && fresh;
}

function parseInitData(initData) {
    const p = new URLSearchParams(initData);
    const readJSON = (k) => {
        const v = p.get(k);
        if (!v) return undefined;
        try { return JSON.parse(v); } catch { return undefined; }
    };
    return {
        user: readJSON('user'),
        chat: readJSON('chat')
    };
}

// Вместо двух запросов - один с JOIN
app.get('/api/shop-data', async (req, res) => {
    try {
        console.log('API запрос начат');
        const startTime = Date.now();

        // Один оптимизированный запрос вместо двух
        const query = `
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
                                'price', CASE WHEN p.price = 0 THEN '' ELSE p.price::text END,
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
        `;

        const result = await pool.query(query);
        console.log(`SQL выполнен за ${Date.now() - startTime}ms`);

        const categories = result.rows.map(row => ({
            id: row.category_id,
            name: row.category_name,
            icon: row.category_icon,
            products: row.products || []
        }));

        res.json({ success: true, data: { categories } });
        console.log(`Полный запрос: ${Date.now() - startTime}ms`);

    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/submit', async (req, res) => {
    try {
        const { payload, initData } = req.body || {};
        if (typeof initData !== 'string') {
            return res.status(400).json({ error: 'initData must be string' });
        }
        if (!validateInitData(initData, process.env.BOT_TOKEN)) {
            return res.status(403).json({ error: 'Invalid initData' });
        }

        const { user, chat } = parseInitData(initData);
        const chatId = chat?.id ?? user?.id;
        if (!chatId) return res.status(400).json({ error: 'chat_id not found' });

        if(payload.type === "addCategory"){
            const result = await AppService.addCategory(payload.category);
        }
        if(payload.type === "addProduct"){
            await AppService.addProduct(payload.product);
        }
        if(payload.type === "removeProduct"){
            await AppService.removeProduct(payload.id);
        }
        if(payload.type === "removeCategory"){
            await AppService.removeCategory(payload.id);
        }

        return res.json({ ok: true, message: 'Данные приняты' });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

const homeButton = {
    reply_markup:{
        inline_keyboard:[
            [
                { text: '🏠 Главное меню', callback_data: 'main_menu' }
            ]
        ]
    }
};

const PORT = process.env.PORT;
app.listen(PORT, async () => {
    console.log(`✅ Сервер запущен на порту ${PORT}`);

    // Устанавливаем webhook
    const webhookUrl = `https://${process.env.WEBHOOK_URL}/webhook`;

    await bot.setWebHook(webhookUrl);
    console.log(`🔗 Webhook установлен на: ${webhookUrl}`);
});

const webAppUrl = process.env.WEB_APP_URL;
const webAppUrlAdmin = process.env.WEB_APP_URL_ADMIN;


const ADMIN_IDS = process.env.ADMIN_IDS.split(',').map(id => parseInt(id, 10));

const isAdmin = (userId) => ADMIN_IDS.includes(userId);
const awaitingPhotoMailing = {};
const awaitingTextMailing = {};

const logUserAction = async (userId) => {
    const timestamp = new Date().toISOString();
    const logedUser = await UserService.createOrUpdateUser(userId);
}

async function showMainMenu(chatId, isAdmin) {
    if (!isAdmin) {
        await bot.sendMessage(chatId, '👋 Добро пожаловать!', {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '🛍️ Открыть магазин', web_app: { url: webAppUrl } },
                    ]
                ]
            }
        });
    } else {
        await bot.sendMessage(chatId, '👋 Добро пожаловать, господин Админ!', {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '🛍️ Магазин', web_app: { url: webAppUrl } },
                        { text: '⚙️ Админ панель', web_app: { url: webAppUrlAdmin } },
                        { text: '⚙️ Сделать рассылку', callback_data: 'admin_mailing' },
                        { text: '📊 Статистика (demo)', callback_data: 'admin_get_stats' },
                    ]
                ]
            }
        });
    }
}

bot.onText(/\/sql (.+)/, async (ctx, match) => {
    const userId = ctx.from.id;
    const sqlQuery = match[1];
    const chatId = ctx.chat.id;

    // Защита: только вы можете использовать эту команду
    if (!isAdmin(userId)) {
        return ctx.reply('❌ Запрещено!');
    }

    try {
        console.log(`[SQL] ${userId}: ${sqlQuery}`);
        const result = await pool.query(sqlQuery);

        let response;
        if (result.rows && result.rows.length > 0) {
            // Ограничиваем вывод, чтобы не упасть в Telegram
            const limitedRows = result.rows.slice(0, 10);
            response = '✅ Результат:\n<pre>' +
                JSON.stringify(limitedRows, null, 2).substring(0, 3000) +
                '</pre>';
        } else {
            response = `✅ Выполнено. Затронуто строк: ${result.rowCount || 0}`;
        }

        await bot.sendMessage(chatId, response, {
            parse_mode: 'HTML',
            reply_markup:{
                inline_keyboard:[
                    [
                        { text: '🏠 Главное меню', callback_data: 'main_menu' }
                    ]
                ]
            }
        });
    } catch (err) {
        console.error('SQL error:', err);
        await bot.sendMessage(chatId, `❌ Ошибка:\n<pre>${err.message}</pre>`,{
            parse_mode: 'HTML',
            reply_markup:{
                inline_keyboard:[
                    [
                        { text: '🏠 Главное меню', callback_data: 'main_menu' }
                    ]
                ]
            }
        });
    }
});

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const userId = msg.from.id;
    console.log(msg);
    await logUserAction(msg.from);
    try {
        if(!isAdmin(userId)){

            await bot.sendMessage(chatId, '👋 Добро пожаловать!', {
                reply_markup:{
                    inline_keyboard:[
                        [
                            {text: '🛍️ Открыть магазин', web_app: {url: webAppUrl}},
                        ]
                    ]
                }
            });
        }
        else {

            await bot.sendMessage(chatId, '👋 Добро пожаловать, господин Админ!', {
                reply_markup:{
                    inline_keyboard:[
                        [
                            {text: '🛍️ Магазин', web_app: {url: webAppUrl}},
                            {text: '⚙️ Админ панель', web_app: {url: webAppUrlAdmin}},
                            {text: '⚙️ Сделать рассылку', callback_data: 'admin_mailing'},
                            {text: '📊 Cтатистика (demo)', callback_data: 'admin_get_stats'},
                        ]
                    ]
                }
            });
        }
    }catch(err){
        console.error("Ошибка", err);
        await bot.sendMessage(chatId, '⚠️ Произошла ошибка. Попробуйте позже.',homeButton);
    }

})

const sendPhotoWithText = async (userId, photoPath, caption) => {
    try {
        await bot.sendPhoto(userId, photoPath, {
            caption: caption,
            parse_mode: 'HTML' // или 'Markdown'
        });
    } catch (error) {
        console.error('❌ Ошибка отправки фото:', error);
    }
};

bot.on("photo", async (msg) => {
    const chatId = msg.chat.id;
    const adminId = msg.from.id;
    const massageId = msg.message_id;

    try {
        if(!isAdmin(adminId)) return;

        if(awaitingPhotoMailing[adminId]){

            const bestPhoto = msg.photo[msg.photo.length - 1];
            const caption = msg.caption;

            await bot.sendMessage(chatId, '📤 Начинаю фото-рассылку');

            try {

                const users = await UserService.getActiveUsers();
                let sent = 0;
                let failed = 0;

                for (const user of users) {

                    if (ADMIN_IDS.includes(Number(user.telegram_id))) continue;

                    try {
                        await sendPhotoWithText(user.telegram_id, bestPhoto.file_id, caption);
                        sent++;

                        // Задержка чтобы не превысить лимиты API
                        await new Promise(resolve => setTimeout(resolve, 100));

                    } catch (error) {
                        failed++;
                        console.error(`❌ Ошибка отправки пользователю ${user.telegram_id}:`, error.message);
                    }
                }

                await bot.sendMessage(chatId, `✅ Фото-рассылка завершена!\n📤 Отправлено: ${sent}\n❌ Ошибок: ${failed}`,homeButton);
            }catch(err){
                console.error("Ошибка", err);
                await bot.sendMessage(chatId, '⚠️ Произошла ошибка. Попробуйте позже.', homeButton);
            }

            delete awaitingPhotoMailing[adminId];
        }
    }catch(err){
        console.error("Ошибка", err);
        await bot.sendMessage(chatId, '⚠️ Произошла ошибка. Попробуйте позже.', homeButton);
    }
})

bot.on("message", async (msg) => {

    const chatId = msg.chat.id;
    const adminId = msg.from.id;
    const massageId = msg.message_id;

    try{
        if(!isAdmin(adminId)) return;

        if(awaitingTextMailing[adminId]){

            const caption = msg.text;

            await bot.sendMessage(chatId, '📤 Начинаю рассылку');

            try {

                const users = await UserService.getActiveUsers();
                let sent = 0;
                let failed = 0;

                for (const user of users) {

                    if (ADMIN_IDS.includes(Number(user.telegram_id))) continue;

                    try {
                        await bot.sendMessage(user.telegram_id, msg.text);
                        sent++;

                        // Задержка чтобы не превысить лимиты API
                        await new Promise(resolve => setTimeout(resolve, 100));

                    } catch (error) {
                        failed++;
                        console.error(`❌ Ошибка отправки пользователю ${user.telegram_id}:`, error.message);
                    }
                }
                await bot.sendMessage(chatId, `✅ Текст-рассылка завершена!\n📤 Отправлено: ${sent}\n❌ Ошибок: ${failed}`,{
                    reply_markup:{
                        inline_keyboard:[
                            [
                                { text: '🏠 Главное меню', callback_data: 'main_menu' }
                            ]
                        ]
                    }
                });
            }catch(err){
                console.error("Ошибка", err);
                await bot.sendMessage(chatId, '⚠️ Произошла ошибка. Попробуйте позже.',homeButton);

            }

            delete awaitingTextMailing[adminId];
        }
    }catch(err){
        console.error("Ошибка", err);
        await bot.sendMessage(chatId, '⚠️ Произошла ошибка. Попробуйте позже.',homeButton);
    }
})

bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const massageId = query.message.message_id;
    const userId = query.from.id;
    const username = query.from.username;

    if(!isAdmin(userId)){
        await bot.answerCallbackQuery(query.id, "❌ Нет доступа", true);
        return;
    }

    try{
        if (query.data === 'main_menu') {
            if(!isAdmin(userId)) {
                delete awaitingPhotoMailing[userId];
                delete awaitingTextMailing[userId];
            }

            await bot.deleteMessage(chatId, massageId);
            await showMainMenu(chatId, isAdmin(userId));
            await bot.answerCallbackQuery(query.id);
        }
        else if(query.data === 'admin_mailing'){
            await bot.deleteMessage(chatId, massageId);
            await bot.sendMessage(chatId, '✅ Выберите тип рассылки', {
                reply_markup:{
                    inline_keyboard:[
                        [
                            {text: '📸 Текст + фото', callback_data: 'admin_mailing_photo'},
                            {text: '📝 Только текст', callback_data: 'admin_mailing_text'},
                        ],
                        [
                        { text: '🏠 Главное меню', callback_data: 'main_menu' }
                        ]
                    ]
                }
            });
        }
        else if(query.data === 'admin_mailing_photo'){
            await bot.deleteMessage(chatId, massageId);
            awaitingPhotoMailing[query.from.id] = true;
            await bot.sendMessage(chatId, 'Введите сообщение');
        }
        else if(query.data === 'admin_mailing_text'){
            await bot.deleteMessage(chatId, massageId);
            awaitingTextMailing[query.from.id] = true;
            await bot.sendMessage(chatId, 'Введите сообщение');
        }
        else if(query.data === 'admin_get_stats'){
            await bot.deleteMessage(chatId, massageId);
            const userStats = await UserService.getUserStats();
            const statsText = `📊 Статистика пользователей:    
            👥 Всего: ${userStats.total}
            ✅ Активных: ${userStats.active}  
            🚫 Заблокированных: ${userStats.blocked}
            🆕 Новых сегодня: ${userStats.todayNew}`;

            await bot.sendMessage(chatId, statsText,{
                reply_markup:{
                    inline_keyboard:[
                        [
                        { text: '🏠 Главное меню', callback_data: 'main_menu' }
                        ]
                    ]
                }
            });
        }
    }catch(err){
        console.error("Ошибка", err);
        await bot.sendMessage(chatId, '⚠️ Произошла ошибка. Попробуйте позже.',homeButton);
    }

    await bot.answerCallbackQuery(query.id, '✅ Готово');
})