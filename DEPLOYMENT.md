# EventPilot deployment checklist

This project is deployment-ready, but provider accounts/credentials must be created by the owner. Never commit `.env` or OAuth/WhatsApp secrets.

## Backend

Recommended: deploy `server/` as a long-running Node web service because Gmail polling uses a 15-minute interval.

Set:

- `NODE_ENV=production`
- `PORT` supplied by the host
- `MONGODB_URI` = MongoDB Atlas connection string
- `JWT_SECRET` = long random secret
- `CLIENT_URL` = deployed frontend origin
- `CLIENT_URLS` = comma-separated allowed frontend origins if more than one is needed
- `APP_ENCRYPTION_KEY` = base64 encoding of exactly 32 random bytes
- `GMAIL_CLIENT_ID`
- `GMAIL_CLIENT_SECRET`
- `GMAIL_REDIRECT_URI=https://YOUR_BACKEND_DOMAIN/api/integrations/gmail/callback`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_APP_SECRET`

Build: `npm ci && npm run build`
Start: `npm start`
Health check: `GET /api/health`

## Frontend

Deploy `frontend/` as a static Vite site.

Set:

- `VITE_API_URL=https://YOUR_BACKEND_DOMAIN/api`

Build: `npm ci && npm run build`
Publish directory: `dist`

## Gmail OAuth

Create a Google OAuth Web application. Register the exact production callback URL:

`https://YOUR_BACKEND_DOMAIN/api/integrations/gmail/callback`

Use the least required Gmail scope (`gmail.readonly`). Public production use of Gmail user-data scopes can require Google's OAuth verification; until approved, keep the OAuth app in testing and add authorized test users as appropriate.

## WhatsApp Business webhook

Configure the official WhatsApp Business/Cloud API webhook to:

`https://YOUR_BACKEND_DOMAIN/api/whatsapp/webhook`

Use the same verify token as `WHATSAPP_VERIFY_TOKEN`. Subscribe to message events. The server verifies `X-Hub-Signature-256` using the app secret before processing.

Important: this integration is for an official WhatsApp Business channel. It does not scrape personal WhatsApp accounts. Whether a particular group-chat workflow is available depends on the capabilities and permissions of the WhatsApp Business product/account being used.

## Security model

- Connected sources are bound to both `userId` and `eventId`.
- Event authorization is checked before listing, syncing, or disconnecting a source.
- Gmail refresh tokens are encrypted with AES-256-GCM before MongoDB storage.
- Source secrets are excluded from API JSON responses.
- Gmail processing uses event-specific search terms and a second event-match gate before analysis.
- WhatsApp webhook signatures are verified before processing.
- Unverified/ambiguous source content is ignored instead of changing an event.
- Deadline changes create an audit record, notify event members, and trigger planner recalculation.
