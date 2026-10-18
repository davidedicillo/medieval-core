import { betterAuth } from 'better-auth';
import { bearer, emailOTP } from 'better-auth/plugins';
import { getMigrations } from 'better-auth/db/migration';
import nodemailer from 'nodemailer';
import { randomUUID } from 'node:crypto';

export function createMailer({ local = false, smtpUrl, from = 'MediEval <noreply@localhost>' } = {}) {
  if (!local && !smtpUrl) throw new Error('Set SMTP_URL and MAIL_FROM to deliver sign-in codes and invitations.');
  const transport = local ? null : nodemailer.createTransport(smtpUrl);
  const messages = [];
  return {
    local,
    messages,
    async send({ to, subject, text }) {
      if (local) {
        messages.unshift({ id: randomUUID(), to, subject, text, createdAt: new Date().toISOString() });
        messages.splice(50);
      } else {
        await transport.sendMail({ from, to, subject, text });
      }
    },
    close() { transport?.close(); },
  };
}

export async function createPlatformAuth({ pool, baseURL, secret, mailer }) {
  if (!secret || secret.length < 32) throw new Error('BETTER_AUTH_SECRET must contain at least 32 characters.');
  const auth = betterAuth({
    appName: 'MediEval',
    baseURL,
    secret,
    database: pool,
    advanced: { database: { validateSchema: false }, ipAddress: { ipAddressHeaders: ['x-medieval-client-ip'] } },
    trustedOrigins: [new URL(baseURL).origin],
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    rateLimit: { enabled: true, window: 60, max: 60 },
    plugins: [
      bearer({ requireSignature: true }),
      emailOTP({
        expiresIn: 600,
        allowedAttempts: 5,
        storeOTP: 'hashed',
        async sendVerificationOTP({ email, otp }) {
          await mailer.send({ to: email, subject: 'Your MediEval sign-in code', text: `Your MediEval sign-in code is ${otp}. It expires in 10 minutes.` });
        },
      }),
    ],
  });
  const migrations = await getMigrations(auth.options);
  await migrations.runMigrations();
  return auth;
}
