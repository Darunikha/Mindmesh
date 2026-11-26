import nodemailer from 'nodemailer';
import env, { isProd } from '../config/env.js';

/**
 * Outgoing email.
 *   smtp     SMTP_HOST is set: messages are really sent.
 *   console  Development without SMTP: messages are printed in the server window.
 *   none     Production without SMTP: features that need email are switched off.
 */
let override = null;
let smtp = null;
const pending = new Set();

/** Replaces the mailer (used by tests). Pass null to restore the configured one. */
export function setMailer(mailer) {
  override = mailer;
}

export function mailDelivery() {
  if (override) return override.delivery;
  if (env.SMTP_HOST) return 'smtp';
  return isProd ? 'none' : 'console';
}

export function smtpOptions(config = env) {
  const port = config.SMTP_PORT ?? 587;
  const secure = config.SMTP_SECURE ? config.SMTP_SECURE === 'true' : port === 465;
  const local = ['localhost', '127.0.0.1', '::1'].includes(config.SMTP_HOST);
  return {
    host: config.SMTP_HOST,
    port,
    secure,
    // Never send credentials or reset links over an unencrypted connection to a remote server.
    requireTLS: !secure && !local,
    ...(config.SMTP_USER ? { auth: { user: config.SMTP_USER, pass: config.SMTP_PASS ?? '' } } : {}),
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  };
}

export async function sendMail(message) {
  if (override) return override.send(message);
  const delivery = mailDelivery();
  if (delivery === 'none') throw new Error('Email is not configured');
  if (delivery === 'console') {
    console.log(`\n[mindmesh] Email is not configured, so this message was not sent.\n  To: ${message.to}\n  Subject: ${message.subject}\n\n${message.text}\n`);
    return undefined;
  }
  smtp ??= nodemailer.createTransport(smtpOptions());
  return smtp.sendMail({ from: env.MAIL_FROM || env.SMTP_USER, ...message });
}

/** Runs email work after the response has gone out. Failures are logged, never shown to the visitor. */
export function inBackground(label, task) {
  const job = Promise.resolve()
    .then(task)
    .catch((err) => console.error(`[mindmesh] Could not send the ${label}: ${err.message}`))
    .finally(() => pending.delete(job));
  pending.add(job);
}

/** Resolves once all background email work has finished. */
export async function whenMailSettled() {
  while (pending.size) await Promise.all(pending);
}
