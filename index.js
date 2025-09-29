require('dotenv').config();
const TelegramApi = require('node-telegram-bot-api');

const bot = new TelegramApi(process.env.BOT_TOKEN, {polling: true});

const webAppUrl = process.env.WEB_APP_URL;
const webAppUrlAdmin = process.env.WEB_APP_URL_ADMIN;

const ADMIN_IDS = process.env.ADMIN_IDS.split(',').map(id => parseInt(id, 10));

const isAdmin = (userId) => ADMIN_IDS.includes(userId);

const awaitingPhotoMailing = {};
const awaitingTextMailing = {};

const logUserAction = (userId, username, action) => {
    const timestamp = new Date().toISOString();
    console.log(`UserID: ${userId}\n UserName: ${username || 'unknown'}\n Action: ${action}\n Time: ${timestamp}`);
}

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const userId = msg.from.id;
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
                            {text: '⚙️ Сделать рассылку', callback_data: 'admin_mailing'}
                        ]
                    ]
                }
            });
        }
    }catch(err){
        console.error("Ошибка", err);
        await bot.sendMessage(chaId, '⚠️ Произошла ошибка. Попробуйте позже.');
    }

})

bot.on("photo", async (msg) => {
    if(!isAdmin(msg.from.id)) return;

    const chatId = msg.chat.id;

    if(awaitingPhotoMailing[msg.from.id]){

        if(!msg.photo){
            await bot.sendMessage(chatId, '⚠️ Фото не найдено');
            return;
        }

        // waiting for database

        delete awaitingPhotoMailing[msg.from.id];
        await bot.sendMessage(chatId, '✅ Рассылка успешно отправлена');
    }
})

bot.on("message", async (msg) => {
    if(!isAdmin(msg.from.id)) return;

    const chatId = msg.chat.id;

    if(awaitingTextMailing[msg.from.id]){
        if(!msg.text){
            await bot.sendMessage(chatId, '⚠️ Текст не найден');
            return;

        }

        // waiting for database
        delete awaitingTextMailing[msg.from.id];
        await bot.sendMessage(chatId, '✅ Рассылка успешно отправлена');
    }
})

bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const username = query.from.username;

    if(!isAdmin(userId)){
        await bot.answerCallbackQuery(query.id, "Нет доступа");
        logUserAction(userId, username, 'Попытка несанкционированного доступа к callback_query');
        return;
    }
    if(query.data === 'admin_mailing'){
        await bot.sendMessage(chatId, 'Выберете вид рассылки', {
            reply_markup:{
                inline_keyboard:[
                    [
                        {text: 'текст + фото',callback_data: 'admin_mailing_photo'},
                        {text: 'текст', callback_data: 'admin_mailing_text'},
                    ]
                ]
            }
        });
    }
    if(query.data === 'admin_mailing_photo'){
        awaitingPhotoMailing[query.from.id] = true;
        await bot.sendMessage(chatId, 'Введите сообщение');
    }
    if(query.data === 'admin_mailing_text'){
        awaitingTextMailing[query.from.id] = true;
        await bot.sendMessage(chatId, 'Введите сообщение');
    }
    await bot.answerCallbackQuery(query.id)

})