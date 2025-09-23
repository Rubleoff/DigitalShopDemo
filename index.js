const TelegramApi = require('node-telegram-bot-api');

const token = '8006975806:AAHIhV5w_RcKUh_KqTALfwu0K9TVwxeX0xA';

const bot = new TelegramApi(token, {polling: true});

bot.on("message", message => {
    console.log(message);
})