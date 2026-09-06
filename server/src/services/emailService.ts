import { env } from '../config/env';

let transporter: any = null;

export function isEmailConfigured(): boolean {
  return Boolean(env.smtpHost && env.smtpUser && env.smtpPassword);
}

async function getTransporter() {
  if (!isEmailConfigured()) return null;
  if (!transporter) {
    const nodemailer = require('nodemailer');
    transporter = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpSecure,
      auth: { user: env.smtpUser, pass: env.smtpPassword },
    });
  }
  return transporter;
}

export async function sendTeamInvitationEmail(args: {
  to: string;
  eventName: string;
  inviterName: string;
  role: string;
  appUrl: string;
}): Promise<boolean> {
  const mailer = await getTransporter();
  if (!mailer) return false;
  await mailer.sendMail({
    from: env.smtpFrom || env.smtpUser,
    to: args.to,
    subject: `You're invited to join ${args.eventName} on EventPilot`,
    text: `${args.inviterName} invited you to join ${args.eventName} as ${args.role}. Sign in to EventPilot to accept the invitation: ${args.appUrl}`,
    html: `<p><strong>${args.inviterName}</strong> invited you to join <strong>${args.eventName}</strong> as <strong>${args.role}</strong>.</p><p>Sign in to EventPilot to accept the invitation.</p><p><a href="${args.appUrl}">Open EventPilot</a></p>`,
  });
  return true;
}
