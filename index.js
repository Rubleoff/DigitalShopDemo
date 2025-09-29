require('dotenv').config();
const {UserService}  = require('./database/userService');

const {query, pool} = require('./database/connection.js');

const TelegramApi = require('node-telegram-bot-api');

const bot = new TelegramApi(process.env.BOT_TOKEN, {polling: true});

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

bot.onText(/\/sql (.+)/, async (ctx, match) => {
    const userId = ctx.message.from.id;
    const sqlQuery = match[1];

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

        await ctx.reply(response, { parse_mode: 'HTML' });
    } catch (err) {
        console.error('SQL error:', err);
        await ctx.reply(`❌ Ошибка:\n<pre>${err.message}</pre>`, { parse_mode: 'HTML' });
    }
});
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const userId = msg.from.id;
    console.log(msg);

    try {
        logUserAction(msg.from);
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
        await bot.sendMessage(chatId, '⚠️ Произошла ошибка. Попробуйте позже.');
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

                await bot.sendMessage(chatId, `✅ Фото-рассылка завершена!\n📤 Отправлено: ${sent}\n❌ Ошибок: ${failed}`);
            }catch(err){
                console.error("Ошибка", err);
                await bot.sendMessage(chatId, '⚠️ Произошла ошибка. Попробуйте позже.');
            }

            delete awaitingPhotoMailing[msg.from.id];
        }
    }catch(err){
        console.error("Ошибка", err);
        await bot.sendMessage(chatId, '⚠️ Произошла ошибка. Попробуйте позже.');
    }

})

bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const adminId = msg.from.id;
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

                await bot.sendMessage(chatId, `✅ Фото-рассылка завершена!\n📤 Отправлено: ${sent}\n❌ Ошибок: ${failed}`);
            }catch(err){
                console.error("Ошибка", err);
                await bot.sendMessage(chatId, '⚠️ Произошла ошибка. Попробуйте позже.');

            }

            delete awaitingPhotoMailing[msg.from.id];
        }
    }catch(err){
        console.error("Ошибка", err);
        await bot.sendMessage(chatId, '⚠️ Произошла ошибка. Попробуйте позже.');
    }
})

bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const username = query.from.username;

    if(!isAdmin(userId)){
        await bot.answerCallbackQuery(query.id, "❌ Нет доступа", true);
        return;
    }

    try{
        if(query.data === 'admin_mailing'){

            await bot.sendMessage(chatId, '✅ Выберите тип рассылки', {
                reply_markup:{
                    inline_keyboard:[
                        [
                            {text: '📸 Текст + фото', callback_data: 'admin_mailing_photo'},
                            {text: '📝 Только текст', callback_data: 'admin_mailing_text'},
                        ]
                    ]
                }
            });
        }
        else if(query.data === 'admin_mailing_photo'){

            awaitingPhotoMailing[query.from.id] = true;
            await bot.sendMessage(chatId, 'Введите сообщение');
        }
        else if(query.data === 'admin_mailing_text'){

            awaitingTextMailing[query.from.id] = true;
            await bot.sendMessage(chatId, 'Введите сообщение');
        }
        else if(query.data === 'admin_get_stats'){

            const userStats = await UserService.getUserStats();
            const statsText = `📊 Статистика пользователей:    
            👥 Всего: ${userStats.total}
            ✅ Активных: ${userStats.active}  
            🚫 Заблокированных: ${userStats.blocked}
            🆕 Новых сегодня: ${userStats.todayNew}`;

            await bot.sendMessage(chatId, statsText);
        }
    }catch(err){
        console.error("Ошибка", err);
        await bot.sendMessage(chatId, '⚠️ Произошла ошибка. Попробуйте позже.');
    }

    await bot.answerCallbackQuery(query.id, '✅ Готово');
})