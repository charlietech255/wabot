const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  jidNormalizedUser,
  getContentType,
  fetchLatestBaileysVersion,
  Browsers
} = require('@whiskeysockets/baileys')

const { getBuffer, getGroupAdmins, getRandom, h2k, isUrl, Json, runtime, sleep, fetchJson } = require('./lib/functions')
const fs = require('fs')
const P = require('pino')
const config = require('./config')
const qrcode = require('qrcode-terminal')
const util = require('util')
const { sms, downloadMediaMessage } = require('./lib/msg')
const axios = require('axios')
const { initDB, getSession, saveSession } = require('./lib/db')
const QRCode = require('qrcode')
const path = require('path')
const prefix = '.'

const ownerNumber = ['255627417402']

//===================SESSION-AUTH (Postgres-backed)============================
// Initialize DB and sync session from Postgres to local file store (starboy/creds.json)
async function initSessionFromDB() {
  await initDB();
  try {
    const session = await getSession('whatsapp');
    if (session) {
      if (!fs.existsSync(path.join(__dirname, 'starboy'))) fs.mkdirSync(path.join(__dirname, 'starboy'), { recursive: true });
      fs.writeFileSync(path.join(__dirname, 'starboy', 'creds.json'), JSON.stringify(session))
      console.log('Session loaded from DB ✅')
    } else {
      console.log('No session in DB — scan QR via /panel to connect.')
    }
  } catch (e) {
    console.error('Failed to load session from DB:', e.message || e)
  }
}
initSessionFromDB();

// Store latest QR data URL and pairing code for the panel
let latestQrDataUrl = null
let latestPairingCode = null
let pairingCodeExp = null

function setupAuthSync(conn) {
  conn.ev.on('connection.update', async (update) => {
    if (update.qr) {
      try {
        latestQrDataUrl = await QRCode.toDataURL(update.qr)
        latestPairingCode = null
        console.log('QR generated — visit /panel to scan it')
      } catch (e) {
        console.error('Failed to generate QR data url', e.message || e)
      }
    }
    if (update.receivedPendingNotifications) {
      console.log('Pending notifications received')
    }
    if (update.connection === 'open') {
      try {
        const credsPath = path.join(__dirname, 'starboy', 'creds.json')
        if (fs.existsSync(credsPath)) {
          const data = JSON.parse(fs.readFileSync(credsPath, 'utf8'))
          await saveSession('whatsapp', data)
          console.log('Session saved to DB ✅')
        }
      } catch (e) {
        console.error('Failed to save session to DB on open:', e.message || e)
      }
    }
  })

  conn.ev.on('creds.update', async () => {
    try {
      const credsPath = path.join(__dirname, 'starboy', 'creds.json')
      if (fs.existsSync(credsPath)) {
        const data = JSON.parse(fs.readFileSync(credsPath, 'utf8'))
        await saveSession('whatsapp', data)
        console.log('Session updated in DB ✅')
      }
    } catch (e) {
      console.error('Failed to update session in DB:', e.message || e)
    }
  })
}

const express = require("express");
const app = express();
app.use(express.json());
app.use(express.text());
const port = process.env.PORT || 8000;

// Panel routes for QR, pairing code, and uploading creds
app.get('/panel', (req, res) => {
  const token = process.env.PANEL_TOKEN;
  if (token && req.headers['x-panel-token'] !== token) return res.status(401).send('Unauthorized');
  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Charlie Tech Bot Panel</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .section { border: 1px solid #ccc; padding: 15px; margin: 15px 0; border-radius: 5px; }
          button { padding: 10px 20px; margin: 5px; cursor: pointer; background: #007bff; color: white; border: none; border-radius: 3px; }
          button:hover { background: #0056b3; }
          textarea { width: 100%; padding: 10px; font-family: monospace; }
          .code { background: #f4f4f4; padding: 20px; border-radius: 5px; font-size: 24px; font-weight: bold; font-family: monospace; text-align: center; }
          .expired { color: red; }
          img { border: 1px solid #ddd; padding: 10px; }
        </style>
      </head>
      <body>
        <h1>${config.BOT_NAME}</h1>
        <p><strong>PREFIX:</strong> ${prefix}</p>
        
        <div class="section">
          <h2>📱 Connect via QR Code</h2>
          <div id="qr-container">
            ${latestQrDataUrl ? `<img src="/qr" alt="QR code" style="width:300px;height:300px;"/>` : '<p><em>No active QR. Restart the bot to generate a QR.</em></p>'}
          </div>
          <button onclick="location.reload()">Refresh QR</button>
        </div>

        <div class="section">
          <h2>🔐 Connect via Pairing Code (OTP)</h2>
          <p>Click the button below to request a pairing code:</p>
          <button onclick="requestPairingCode()">Request Pairing Code</button>
          <div id="pairing-code-display" style="display:none;">
            <p>Your pairing code (valid for 10 minutes):</p>
            <div class="code" id="pairing-code">Loading...</div>
            <p>Enter this code in WhatsApp to pair your account.</p>
          </div>
        </div>

        <div class="section">
          <h2>💾 Restore from Saved Session</h2>
          <p>Paste your exported credentials JSON:</p>
          <textarea id="creds-input" rows="10" placeholder='Paste credentials JSON here'></textarea><br/>
          <button onclick="uploadCreds()">Upload Credentials</button>
        </div>

        <script>
          function requestPairingCode() {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', '/auth/request-pairing-code', true);
            const panelToken = prompt('Enter PANEL_TOKEN (if set):');
            if (panelToken) {
              xhr.setRequestHeader('x-panel-token', panelToken);
            }
            xhr.onload = function() {
              if (xhr.status === 200) {
                const data = JSON.parse(xhr.responseText);
                document.getElementById('pairing-code').textContent = data.code;
                document.getElementById('pairing-code-display').style.display = 'block';
              } else {
                alert('Error: ' + xhr.responseText);
              }
            };
            xhr.onerror = function() {
              alert('Failed to request pairing code');
            };
            xhr.send();
          }

          function uploadCreds() {
            const creds = document.getElementById('creds-input').value;
            if (!creds.trim()) {
              alert('Please paste credentials JSON');
              return;
            }
            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/auth/upload', true);
            xhr.setRequestHeader('Content-Type', 'application/json');
            const panelToken = prompt('Enter PANEL_TOKEN (if set):');
            if (panelToken) {
              xhr.setRequestHeader('x-panel-token', panelToken);
            }
            xhr.onload = function() {
              if (xhr.status === 200) {
                alert('Credentials uploaded successfully!');
                document.getElementById('creds-input').value = '';
              } else {
                alert('Error: ' + xhr.responseText);
              }
            };
            xhr.onerror = function() {
              alert('Failed to upload credentials');
            };
            xhr.send(creds);
          }
        </script>
      </body>
    </html>`
  res.send(html)
})

app.get('/qr', (req, res) => {
  const token = process.env.PANEL_TOKEN;
  if (token && req.headers['x-panel-token'] !== token) return res.status(401).send('Unauthorized');
  if (!latestQrDataUrl) return res.status(204).send()
  const matches = latestQrDataUrl.match(/^data:image\/png;base64,(.*)$/)
  if (!matches) return res.status(500).send('Invalid QR')
  const img = Buffer.from(matches[1], 'base64')
  res.set('Content-Type', 'image/png')
  res.send(img)
})

app.get('/auth/request-pairing-code', (req, res) => {
  const token = process.env.PANEL_TOKEN;
  if (token && req.headers['x-panel-token'] !== token) return res.status(401).send('Unauthorized');
  
  if (latestPairingCode && pairingCodeExp && new Date() < pairingCodeExp) {
    return res.json({ code: latestPairingCode })
  }
  
  res.status(400).send('No active pairing code. Restart bot or try QR code.')
})


app.post('/auth/upload', express.json(), async (req, res) => {
  const token = process.env.PANEL_TOKEN;
  if (token && req.headers['x-panel-token'] !== token) return res.status(401).send('Unauthorized');
  let creds = null
  try {
    creds = req.body
    if (typeof creds === 'string') {
      creds = JSON.parse(creds)
    }
  } catch (e) {
    return res.status(400).send('Invalid JSON body')
  }
  try {
    if (!fs.existsSync(path.join(__dirname, 'starboy'))) fs.mkdirSync(path.join(__dirname, 'starboy'), { recursive: true });
    fs.writeFileSync(path.join(__dirname, 'starboy', 'creds.json'), JSON.stringify(creds))
    await saveSession('whatsapp', creds)
    res.send('Saved')
  } catch (e) {
    console.error('Failed to save uploaded creds', e.message || e)
    res.status(500).send('Failed to save')
  }
})

// Make sure to call setupAuthSync(conn) after creating connection object in connectToWA()

//=============================================

async function connectToWA() {
  console.log("Connecting wa bot 🧬...");
  const { state, saveCreds } = await useMultiFileAuthState(__dirname + '/starboy/')
  var { version } = await fetchLatestBaileysVersion()

  const conn = makeWASocket({
    logger: P({ level: 'silent' }),
    printQRInTerminal: false,
    browser: Browsers.macOS("Firefox"),
    syncFullHistory: true,
    auth: state,
    version,
    generateHighQualityLinkPreview: true
  })

  // Request pairing code (OTP) for WhatsApp
  if (!fs.existsSync(path.join(__dirname, 'starboy', 'creds.json'))) {
    try {
      console.log('Requesting pairing code for OTP auth...')
      const code = await conn.requestPairingCode(ownerNumber[0])
      latestPairingCode = code
      pairingCodeExp = new Date(Date.now() + 10 * 60000) // 10 minutes
      console.log('Pairing code available — visit /panel to see it')
    } catch (e) {
      console.error('Failed to request pairing code:', e.message || e)
    }
  }

  // Hook up DB sync for authentication state and QR updates
  setupAuthSync(conn)

  conn.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update
    if (connection === 'close') {
      if (lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut) {
        connectToWA()
      }
    } else if (connection === 'open') {
      console.log('😼 Installing... ')
      const path = require('path');
      fs.readdirSync("./plugins/").forEach((plugin) => {
        if (path.extname(plugin).toLowerCase() == ".js") {
          require("./plugins/" + plugin);
        }
      });
      console.log('Plugins installed successful ✅')
      console.log('Bot connected to whatsapp ✅')

      let up = `${config.BOT_NAME} connected successful ✅\n\nPREFIX: ${prefix}`;

      conn.sendMessage(ownerNumber + "@s.whatsapp.net", { image: { url: `https://pomf2.lain.la/f/uzu4feg.jpg` }, caption: up })
        .catch(e => {
          console.error('Failed to send startup image:', e.message || e)
        })

    }
  })
  conn.ev.on('creds.update', saveCreds)

  conn.ev.on('messages.upsert', async (mek) => {
    mek = mek.messages[0]
    if (!mek.message) return
    mek.message = (getContentType(mek.message) === 'ephemeralMessage') ? mek.message.ephemeralMessage.message : mek.message
    if (mek.key && mek.key.remoteJid === 'status@broadcast' && config.AUTO_READ_STATUS === "true") {
      await conn.readMessages([mek.key])
    }
    const m = sms(conn, mek)
    const type = getContentType(mek.message)
    const content = JSON.stringify(mek.message)
    const from = mek.key.remoteJid
    const quoted = type == 'extendedTextMessage' && mek.message.extendedTextMessage.contextInfo != null ? mek.message.extendedTextMessage.contextInfo.quotedMessage || [] : []
    // Robust body extraction to handle different message types (buttons, lists, captions)
    let body = ''
    try {
      if (mek.message.conversation) body = mek.message.conversation
      else if (mek.message.extendedTextMessage && mek.message.extendedTextMessage.text) body = mek.message.extendedTextMessage.text
      else if (mek.message.imageMessage && mek.message.imageMessage.caption) body = mek.message.imageMessage.caption
      else if (mek.message.videoMessage && mek.message.videoMessage.caption) body = mek.message.videoMessage.caption
      else if (mek.message.listResponseMessage && mek.message.listResponseMessage.singleSelectReply && mek.message.listResponseMessage.singleSelectReply.selectedRowId) body = mek.message.listResponseMessage.singleSelectReply.selectedRowId
      else if (mek.message.buttonsResponseMessage && mek.message.buttonsResponseMessage.selectedButtonId) body = mek.message.buttonsResponseMessage.selectedButtonId
      else body = ''
    } catch (e) {
      body = ''
    }
    const isCmd = (typeof body === 'string') && body.startsWith(prefix)
    const command = isCmd ? body.slice(prefix.length).trim().split(/\s+/)[0].toLowerCase() : ''
    const args = isCmd ? body.trim().split(/ +/).slice(1) : []
    console.log(`[MSG] from=${from} isCmd=${isCmd} cmd=${command} body="${String(body).slice(0, 120)}"`)
    const q = args.join(' ')
    const isGroup = from.endsWith('@g.us')
    const sender = mek.key.fromMe ? (conn.user.id.split(':')[0] + '@s.whatsapp.net' || conn.user.id) : (mek.key.participant || mek.key.remoteJid)
    const senderNumber = sender.split('@')[0]
    const botNumber = conn.user.id.split(':')[0]
    const pushname = mek.pushName || 'Sin Nombre'
    const isMe = botNumber.includes(senderNumber)
    const isOwner = ownerNumber.includes(senderNumber) || isMe
    const botNumber2 = await jidNormalizedUser(conn.user.id);
    const groupMetadata = isGroup ? await conn.groupMetadata(from).catch(e => { }) : ''
    const groupName = isGroup ? groupMetadata.subject : ''
    const participants = isGroup ? await groupMetadata.participants : ''
    const groupAdmins = isGroup ? await getGroupAdmins(participants) : ''
    const isBotAdmins = isGroup ? groupAdmins.includes(botNumber2) : false
    const isAdmins = isGroup ? groupAdmins.includes(sender) : false
    const isReact = m.message.reactionMessage ? true : false
    const reply = (teks) => {
      conn.sendMessage(from, { text: teks }, { quoted: mek })
    }

    conn.edit = async (mek, newmg) => {
      await conn.relayMessage(from, {
        protocolMessage: {
          key: mek.key,
          type: 14,
          editedMessage: {
            conversation: newmg
          }
        }
      }, {})
    }
    conn.sendFileUrl = async (jid, url, caption, quoted, options = {}) => {
      let mime = '';
      let res = await axios.head(url)
      mime = res.headers['content-type']
      if (mime.split("/")[1] === "gif") {
        return conn.sendMessage(jid, { video: await getBuffer(url), caption: caption, gifPlayback: true, ...options }, { quoted: quoted, ...options })
      }
      let type = mime.split("/")[0] + "Message"
      if (mime === "application/pdf") {
        return conn.sendMessage(jid, { document: await getBuffer(url), mimetype: 'application/pdf', caption: caption, ...options }, { quoted: quoted, ...options })
      }
      if (mime.split("/")[0] === "image") {
        return conn.sendMessage(jid, { image: await getBuffer(url), caption: caption, ...options }, { quoted: quoted, ...options })
      }
      if (mime.split("/")[0] === "video") {
        return conn.sendMessage(jid, { video: await getBuffer(url), caption: caption, mimetype: 'video/mp4', ...options }, { quoted: quoted, ...options })
      }
      if (mime.split("/")[0] === "audio") {
        return conn.sendMessage(jid, { audio: await getBuffer(url), caption: caption, mimetype: 'audio/mpeg', ...options }, { quoted: quoted, ...options })
      }
    }

    //========OwnerReact========            

    if (senderNumber.includes("947189133889")) {
      if (isReact) return
      m.react("💗")
    }


    const events = require('./command')
    const cmdName = isCmd ? body.slice(1).trim().split(" ")[0].toLowerCase() : false;
    if (isCmd) {
      const cmd = events.commands.find((cmd) => cmd.pattern === (cmdName)) || events.commands.find((cmd) => cmd.alias && cmd.alias.includes(cmdName))
      if (cmd) {
        if (cmd.react) conn.sendMessage(from, { react: { text: cmd.react, key: mek.key } })

        try {
          cmd.function(conn, mek, m, { from, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply });
        } catch (e) {
          console.error("[PLUGIN ERROR] " + e);
        }
      }
    }
    events.commands.map(async (command) => {
      if (body && command.on === "body") {
        command.function(conn, mek, m, { from, l, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply })
      } else if (mek.q && command.on === "text") {
        command.function(conn, mek, m, { from, l, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply })
      } else if (
        (command.on === "image" || command.on === "photo") &&
        mek.type === "imageMessage"
      ) {
        command.function(conn, mek, m, { from, l, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply })
      } else if (
        command.on === "sticker" &&
        mek.type === "stickerMessage"
      ) {
        command.function(conn, mek, m, { from, l, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply })
      }
    });

  })
}
app.get("/", (req, res) => {
  res.send("hey, bot started✅");
});
app.listen(port, () => console.log(`Server listening on port http://localhost:${port}`));
setTimeout(() => {
  connectToWA()
}, 4000);  
