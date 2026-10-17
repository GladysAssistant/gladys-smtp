// -----------------------------------------------------------------------------
// The scene actions (manifest `scene_actions` field).
//
// The notifications only reach Gladys users, at the address of their "My
// account" block. A scene sometimes needs more: warn the neighbour, send a
// report to a shared mailbox, write to the property manager. `send_email` sends
// to any address, with a subject and a body the scene author writes — scene
// variables ({{...}}) included, already resolved by the core.
//
// Throwing fails this action only: the scene logs the error and goes on.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { buildMail, buildSubject } from './message.js';

const logger = createLogger({ name: 'scene-actions' });

/** A scene must not turn the integration into a mailing list. */
export const MAX_RECIPIENTS = 10;

// Deliberately simple: one `@`, no whitespace, no address-list syntax. The SMTP
// server has the final word, this only rejects what is obviously not ONE
// address (a typo, a display name, a stray quote) before it reaches the parser.
const EMAIL_PATTERN = /^[^\s@<>()[\]",;:]+@[^\s@<>()[\]",;:]+$/;

/**
 * Read the recipient field: one address, or several separated by commas or
 * semicolons.
 * @param {unknown} value - The `to` field as resolved by the core.
 * @returns {string[]} The addresses.
 * @throws {Error} When the list is empty, too long, or holds an invalid address.
 */
export function parseRecipients(value) {
  const addresses = String(value ?? '')
    .split(/[,;]/)
    .map((address) => address.trim())
    .filter((address) => address !== '');

  if (addresses.length === 0) {
    throw new Error('No recipient email address');
  }
  if (addresses.length > MAX_RECIPIENTS) {
    throw new Error(`Too many recipients (${addresses.length}, at most ${MAX_RECIPIENTS})`);
  }
  const invalid = addresses.find((address) => !EMAIL_PATTERN.test(address));
  if (invalid) {
    throw new Error(`Invalid recipient email address: "${invalid}"`);
  }
  return addresses;
}

/**
 * Send an email written in a scene.
 * @param {import('./smtp.js').SmtpClient} smtp - The SMTP client.
 * @param {Record<string, unknown>} config - The normalized configuration.
 * @param {{to?: string, subject?: string, body?: string}} fields - The resolved action fields.
 * @returns {Promise<{message_id: string|null}>} The declared outputs.
 */
export async function sendEmail(smtp, config, fields = {}) {
  const to = parseRecipients(fields.to);
  const body = String(fields.body ?? '');
  const subject = String(fields.subject ?? '').trim();
  if (body.trim() === '' && subject === '') {
    throw new Error('The email has neither a subject nor a message');
  }

  const mail = buildMail({ email: to.join(', ') }, { text: body }, config);
  if (subject !== '') {
    // Same rules as a derived subject: one line, prefixed, truncated — a
    // scene variable cannot smuggle a line break into the header.
    mail.subject = buildSubject(subject, config);
  }

  logger.info(`Scene action send_email -> ${to.length} recipient(s)`);
  const info = await smtp.sendMail(mail);
  return { message_id: info?.messageId ?? null };
}

/**
 * The registry the wiring walks to register the handlers. Its keys ARE the
 * `scene_actions` keys of the manifest — a test keeps the two in sync.
 */
export const SCENE_ACTIONS = {
  send_email: (smtp, config, fields) => sendEmail(smtp, config, fields),
};
