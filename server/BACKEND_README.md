# EventPilot backend

This backend is the functional API for EventPilot. It persists events in MongoDB and supports the complete event lifecycle:

- Authentication (JWT)
- Event create/read/update/delete
- Manual event editing with audit entry + planner recalculation
- Event-specific deadlines: create/edit/delete/bulk
- Automatic website monitoring every 12 hours + manual sync
- JS-rendered website extraction through Playwright fallback
- Deadline deduplication by logical milestone
- Event-scoped team membership and invitations
- Optional SMTP invitation emails
- Event-scoped Gmail OAuth connection + polling
- Event-scoped WhatsApp Business webhook ingestion
- Tasks, requirements and resources
- Planner generation/recalculation
- Notifications and event update/audit log
- Cascading event deletion for all event-scoped records

## Start

```powershell
npm install
npx playwright install chromium
npm run dev
```

## Required `.env`

Copy `.env.example` to `.env` and set at least:

- `MONGODB_URI`
- `JWT_SECRET`
- `CLIENT_URL`
- `APP_ENCRYPTION_KEY` for Gmail token encryption

Gmail requires:

- `GMAIL_CLIENT_ID`
- `GMAIL_CLIENT_SECRET`
- `GMAIL_REDIRECT_URI`

WhatsApp requires Meta Business API values:

- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_APP_SECRET`

Optional invitation-email delivery requires SMTP values:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `SMTP_FROM`

## Important integration note

The WhatsApp integration is for an official WhatsApp Business/Cloud API channel and webhook. It does not scrape personal WhatsApp accounts or private group chats. A normal personal/group chat cannot be connected by this backend without an official supported API path.

## Main API groups

- `/api/auth/*`
- `/api/events/*`
- `/api/events/:id/team`
- `/api/events/:id/invitations`
- `/api/events/:id/tasks`
- `/api/events/:id/requirements`
- `/api/events/:id/resources`
- `/api/events/:id/deadlines`
- `/api/events/:id/planner`
- `/api/events/:id/updates`
- `/api/events/:id/sources`
- `/api/integrations/gmail/callback`
- `/api/whatsapp/webhook`
- `/api/system/events/:id/sync-website`
- `/api/system/events/sync-websites`

All event-scoped endpoints enforce owner/member isolation.
