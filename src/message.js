// -----------------------------------------------------------------------------
// Turning a Gladys message into an email.
//
// `onSendMessage(contact, message)` hands over two things:
//   - `contact`: the target user's `contact_schema` values — here `{ email }`;
//   - `message`: `{ text, file }`, where `file` is an optional attached image
//     (a camera snapshot, base64) or null.
// Email needs more than that — a subject, a sender, an HTML part to show the
// image inline — so everything that shapes the email lives here, as pure
// functions the tests can exercise without a mail server.
// -----------------------------------------------------------------------------

/** RFC 2822 recommends subject lines to stay short; keep ours well under it. */
export const MAX_SUBJECT_LENGTH = 78;

/** Gladys caps message texts at 4096 characters (contract B.15). */
export const MAX_TEXT_LENGTH = 4096;

const ELLIPSIS = '…';

/**
 * Build the subject from the message itself: its first non-empty line, so the
 * mailbox list is readable without opening anything. A fixed subject on every
 * notification would make the inbox useless.
 * @param {string} text - The message text.
 * @param {Record<string, unknown>} config - The normalized configuration.
 * @returns {string} The subject line.
 */
export function buildSubject(text, config = {}) {
  const prefix = (config.subject_prefix ?? '').trim();
  const firstLine = String(text ?? '')
    .split('\n')
    .map((line) => line.trim().replace(/\s+/g, ' '))
    .find((line) => line.length > 0);

  if (!firstLine) {
    // A message with an image and no text is legitimate.
    return prefix || 'Gladys Assistant';
  }

  const room = prefix ? MAX_SUBJECT_LENGTH - prefix.length - 2 : MAX_SUBJECT_LENGTH;
  const summary =
    firstLine.length > room
      ? `${firstLine.slice(0, Math.max(room - 1, 1)).trimEnd()}${ELLIPSIS}`
      : firstLine;

  return prefix ? `${prefix}: ${summary}` : summary;
}

/**
 * Read the image Gladys attached to the message. It arrives as a base64 string
 * that may carry a `data:` or bare `image/jpg;base64,` prefix depending on
 * where it comes from, so accept all three shapes and keep the raw base64.
 * @param {string|null|undefined} file - The `file` field of the message.
 * @returns {{filename: string, content: string, encoding: string, contentType: string, cid: string}|null} A nodemailer attachment, or null when there is no image.
 */
export function parseAttachment(file) {
  if (typeof file !== 'string' || file.trim() === '') {
    return null;
  }
  const trimmed = file.trim();
  const match = trimmed.match(/^(?:data:)?([\w.+-]+\/[\w.+-]+)?;?base64,(.*)$/s);
  const contentType = match?.[1] ?? 'image/jpeg';
  const content = (match?.[2] ?? trimmed).replace(/\s/g, '');
  if (content === '') {
    return null;
  }
  const extension = contentType.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'jpg';
  return {
    filename: `gladys-snapshot.${extension === 'jpeg' ? 'jpg' : extension}`,
    content,
    encoding: 'base64',
    contentType,
    // Referenced by the HTML part so the image shows up inline, not as a
    // download the user has to click.
    cid: 'gladys-snapshot',
  };
}

/**
 * @param {string} value - Raw text.
 * @returns {string} The text, safe to inject in an HTML document.
 */
export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Build the HTML part: the plain text is the reference body, this only makes it
 * pleasant to read and embeds the snapshot when there is one.
 * @param {string} text - The message text.
 * @param {object|null} attachment - The attachment returned by parseAttachment.
 * @returns {string} The HTML body.
 */
export function buildHtml(text, attachment) {
  const paragraph = escapeHtml(text).replaceAll('\n', '<br />');
  const image = attachment
    ? `<p style="margin:16px 0 0"><img src="cid:${attachment.cid}" alt="" style="max-width:100%;border-radius:8px" /></p>`
    : '';
  return [
    '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;font-size:15px;line-height:1.5;color:#222">',
    `<p style="margin:0;white-space:pre-wrap">${paragraph}</p>`,
    image,
    '</div>',
  ].join('');
}

/**
 * Format the `From` header from the configuration.
 * @param {Record<string, unknown>} config - The normalized configuration.
 * @returns {{name: string, address: string}|string} A nodemailer sender.
 */
export function buildSender(config) {
  const address = config.from_email;
  const name = (config.from_name ?? '').trim();
  return name ? { name, address } : address;
}

/**
 * Build the complete email out of a Gladys message.
 * @param {Record<string, unknown>} contact - The target user's contact_schema values.
 * @param {{text?: string, file?: string|null}} message - The Gladys message.
 * @param {Record<string, unknown>} config - The normalized configuration.
 * @returns {object} A nodemailer mail object.
 * @throws {Error} When the contact carries no email address.
 */
export function buildMail(contact, message, config) {
  const to = typeof contact?.email === 'string' ? contact.email.trim() : '';
  if (to === '') {
    // Gladys skips users without configured credentials, so this is a bug or a
    // half-filled "My account" block: say so instead of failing on the wire.
    throw new Error('No email address configured for this user');
  }

  const text = String(message?.text ?? '').slice(0, MAX_TEXT_LENGTH);
  const attachment = parseAttachment(message?.file);

  return {
    from: buildSender(config),
    to,
    subject: buildSubject(text, config),
    text,
    html: buildHtml(text, attachment),
    ...(attachment ? { attachments: [attachment] } : {}),
  };
}
