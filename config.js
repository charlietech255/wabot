const fs = require('fs');
if (fs.existsSync('config.env')) require('dotenv').config({ path: './config.env' });

function convertToBool(text, fault = 'true') {
    return text === fault ? true : false;
}
module.exports = {
    SESSION_ID: process.env.SESSION_ID || "",
    BOT_NAME: process.env.BOT_NAME || "charlie tech bot",
    DATABASE_URL: process.env.DATABASE_URL || "",
    PANEL_TOKEN: process.env.PANEL_TOKEN || "",
    ALIVE_IMG: process.env.ALIVE_IMG || "https://files.catbox.moe/sz8lsb.png",
    MENU_THUMB: process.env.MENU_THUMB || process.env.ALIVE_IMG || "https://files.catbox.moe/sz8lsb.png",
    ALIVE_MSG: process.env.ALIVE_MSG || `*🤖 ${process.env.BOT_NAME || 'charlie tech bot'} is online!*`,
    WELCOME_IMG: process.env.WELCOME_IMG || "https://files.catbox.moe/sz8lsb.png",
    WELCOME_MSG: process.env.WELCOME_MSG || "👋 Welcome @user to *{group}*!\nPlease read the rules and enjoy your stay.",
    GOODBYE_IMG: process.env.GOODBYE_IMG || "https://files.catbox.moe/sz8lsb.png",
    GOODBYE_MSG: process.env.GOODBYE_MSG || "😢 Goodbye @user. We will miss you!",
    DEFAULT_AUTOTYPING_ON_DEPLOY: process.env.DEFAULT_AUTOTYPING_ON_DEPLOY ? process.env.DEFAULT_AUTOTYPING_ON_DEPLOY === 'true' : true,
    DEFAULT_AUTORECORD_ON_DEPLOY: process.env.DEFAULT_AUTORECORD_ON_DEPLOY ? process.env.DEFAULT_AUTORECORD_ON_DEPLOY === 'true' : true,
    AUTO_READ_STATUS: process.env.AUTO_READ_STATUS || "true",
};
