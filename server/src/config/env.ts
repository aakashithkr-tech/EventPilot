import dotenv from 'dotenv';

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    // eslint-disable-next-line no-console
    console.error(`[env] Missing required environment variable: ${name}`);
    console.error('[env] Copy server/.env.example to server/.env and fill it in.');
    process.exit(1);
  }
  return value;
}

export const env = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: required('MONGODB_URI'),
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  clientUrls: (process.env.CLIENT_URLS || process.env.CLIENT_URL || 'http://localhost:5173').split(',').map((v) => v.trim()).filter(Boolean),
  appEncryptionKey: process.env.APP_ENCRYPTION_KEY,
  gmailClientId: process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
  gmailClientSecret: process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET,
  gmailRedirectUri: process.env.GMAIL_REDIRECT_URI || 'http://localhost:5000/api/integrations/gmail/callback',
  whatsappVerifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
  whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
  whatsappAccessToken: process.env.WHATSAPP_ACCESS_TOKEN,
  whatsappAppSecret: process.env.WHATSAPP_APP_SECRET,
  sourceSyncSecret: process.env.SOURCE_SYNC_SECRET,
  smtpHost: process.env.SMTP_HOST,
  smtpPort: parseInt(process.env.SMTP_PORT || '587', 10),
  smtpSecure: process.env.SMTP_SECURE === 'true',
  smtpUser: process.env.SMTP_USER,
  smtpPassword: process.env.SMTP_PASSWORD,
  smtpFrom: process.env.SMTP_FROM,
};
