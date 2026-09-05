import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import { connectDB } from './config/db';
import authRoutes from './routes/authRoutes';
import eventRoutes from './routes/eventRoutes';
import invitationRoutes from './routes/invitationRoutes';
import taskRoutes from './routes/taskRoutes';
import requirementRoutes from './routes/requirementRoutes';
import resourceRoutes from './routes/resourceRoutes';
import deadlineRoutes from './routes/deadlineRoutes';
import notificationRoutes from './routes/notificationRoutes';
import { notFoundHandler, errorHandler } from './middleware/errorMiddleware';
import { gmailCallback } from './controllers/sourceController';
import sourceRoutes from './routes/sourceRoutes';
import whatsappRoutes from './routes/whatsappRoutes';
import systemRoutes from './routes/systemRoutes';
import { startSourcePolling } from './services/sourceSyncService';
import { startWebsiteEventMonitoring } from './services/eventSourceMonitorService';

async function main() {
  await connectDB();

  const app = express();

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || env.clientUrls.includes(origin)) return callback(null, true);
      return callback(new Error('Origin not allowed by EventPilot CORS policy'));
    },
    credentials: true,
  }));
  app.use(express.json({ verify: (req: any, _res, buf) => { req.rawBody = Buffer.from(buf); } }));

  app.get('/api/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok', env: env.nodeEnv } });
  });

  // Feature 1: Auth. Feature 2: Events. Feature 3: Team + Invitations.
  // Feature 4: Tasks. Feature 5: Requirements. Feature 6: Resources.
  // Feature 7: Deadlines. Feature 8: Event Updates. Feature 9:
  // Notifications. Event analysis is mounted under /api/events/analyze.
  app.use('/api/auth', authRoutes);
  // OAuth callback is intentionally public; the short-lived signed state binds
  // the callback to the authenticated user + event before any token is stored.
  app.get('/api/integrations/gmail/callback', gmailCallback);
  app.use('/api/events', eventRoutes);
  app.use('/api/invitations', invitationRoutes);
  app.use('/api/tasks', taskRoutes);
  app.use('/api/requirements', requirementRoutes);
  app.use('/api/resources', resourceRoutes);
  app.use('/api/deadlines', deadlineRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/whatsapp', whatsappRoutes);
  app.use('/api', sourceRoutes);
  app.use('/api/system', systemRoutes);

  // Poll connected Gmail sources every 15 minutes while the server is running.
  // Each query is generated from its bound event, so one event cannot use another
  // event's connected source. WhatsApp updates arrive through the webhook above.
  startSourcePolling();
  startWebsiteEventMonitoring();

  app.use(notFoundHandler);
  app.use(errorHandler);

  app.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[server] EventPilot API running on http://localhost:${env.port}`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[server] Failed to start:', err);
  process.exit(1);
});
