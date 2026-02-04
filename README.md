# Charlie Tech Bot

A WhatsApp bot built with Node.js and @whiskeysockets/baileys. This fork is prepared for deployment on Render and saves WhatsApp session credentials to a Postgres database.

## Features
- Plugin-based commands in `./plugins/`
- Media handling (images, audio, video, stickers)
- **Dual authentication**: QR code scanning OR OTP pairing code
- Panel to manage connections: `GET /panel`
- Session persistence in Postgres (via `DATABASE_URL`), suitable for Render Postgres

## Deploy on Render
1. Create a new Web Service using the Node starter.
2. Set `DATABASE_URL` in the service environment (Render-managed Postgres will provide this).
3. (Optional) Set `PANEL_TOKEN` to protect the panel endpoints.
4. Start command: `npm start`

## Connecting the bot
Visit `https://<your-service>.onrender.com/panel` for three connection options:

### 1. **QR Code** 
- Scan the QR code with your WhatsApp device to pair instantly.

### 2. **Pairing Code (OTP)**
- Click "Request Pairing Code" on the panel.
- A 6-digit code will appear (valid for 10 minutes).
- Open WhatsApp → Settings → Linked devices → Link a device.
- Enter the pairing code when prompted.

### 3. **Restore Saved Session**
- Paste your exported `creds.json` to restore a previous session.

## Environment Variables
```
DATABASE_URL=postgres://user:password@host:port/dbname  # Required for session storage
BOT_NAME=charlie tech bot                               # Optional bot name
PANEL_TOKEN=your_secret_token                           # Optional panel protection
```

## Security
- If `PANEL_TOKEN` is set, include the header `x-panel-token: <value>` when accessing `/panel`, `/qr`, or `/auth/request-pairing-code`.
- Never commit `starboy/creds.json` to version control; it's stored in Postgres.


