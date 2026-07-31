// -----------------------------------------------------------------------------
// The buttons of the Configuration screen (manifest `actions` field).
//
// "Did I type my password right?" is the whole difficulty of an SMTP setup, and
// the answer must not be "wait for the next notification and see". These two
// actions give it immediately: one opens a session without sending anything,
// the other sends a real email end to end.
//
// The resolved multi-language message is displayed under the button; a thrown
// error is displayed there too, which is why the SMTP failures are already
// translated into plain sentences by `describeSmtpError`.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { isConfigured, missingConfigKeys } from './config.js';
import { buildSender } from './message.js';

const logger = createLogger({ name: 'actions' });

function assertConfigured(config) {
  if (!isConfigured(config)) {
    throw new Error(
      `Fill in the SMTP configuration first (missing: ${missingConfigKeys(config).join(', ')})`,
    );
  }
}

/**
 * Open a connection to the SMTP server and authenticate, without sending.
 * @param {import('./smtp.js').SmtpClient} smtp - The SMTP client.
 * @param {Record<string, unknown>} config - The normalized configuration.
 * @returns {Promise<{en: string, fr: string}>} The message shown under the button.
 */
export async function testConnection(smtp, config) {
  assertConfigured(config);
  logger.info(`Action test_connection -> ${config.host}:${config.port}`);
  await smtp.verify();
  const target = `${config.host}:${config.port}`;
  return {
    en: `Connection to ${target} succeeded${config.username ? ` as ${config.username}` : ''}.`,
    fr: `Connexion à ${target} réussie${config.username ? ` en tant que ${config.username}` : ''}.`,
  };
}

/**
 * Send a real email, to prove the whole chain works (and to check the spam
 * folder, which no connection test can do).
 * @param {import('./smtp.js').SmtpClient} smtp - The SMTP client.
 * @param {Record<string, unknown>} config - The normalized configuration.
 * @param {{to?: string}} fields - The values typed in the action mini-form.
 * @returns {Promise<{en: string, fr: string}>} The message shown under the button.
 */
export async function sendTestEmail(smtp, config, fields = {}) {
  assertConfigured(config);
  const to = typeof fields.to === 'string' ? fields.to.trim() : '';
  if (to === '') {
    throw new Error('Please enter a recipient email address');
  }
  logger.info(`Action send_test_email -> ${to}`);
  await smtp.sendMail({
    from: buildSender(config),
    to,
    subject: config.subject_prefix ? `${config.subject_prefix}: test email` : 'Gladys test email',
    text: 'This is a test email sent by the SMTP integration of Gladys Assistant.\n\nIf you received it, Gladys can notify you by email.',
    html: '<p>This is a test email sent by the SMTP integration of <b>Gladys Assistant</b>.</p><p>If you received it, Gladys can notify you by email.</p>',
  });
  return {
    en: `Test email sent to ${to}. Check the inbox, and the spam folder if needed.`,
    fr: `Email de test envoyé à ${to}. Vérifiez la boîte de réception, et les spams si besoin.`,
  };
}

/**
 * The registry index.js walks to register the handlers. Its keys ARE the
 * `actions` keys of the manifest — a test keeps the two in sync, because a
 * button wired to nothing only fails in the user's hands.
 */
export const ACTIONS = {
  test_connection: (smtp, config) => testConnection(smtp, config),
  send_test_email: (smtp, config, fields) => sendTestEmail(smtp, config, fields),
};
