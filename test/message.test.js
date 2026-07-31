import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig } from '../src/config.js';
import {
  MAX_SUBJECT_LENGTH,
  buildHtml,
  buildMail,
  buildSender,
  buildSubject,
  escapeHtml,
  parseAttachment,
} from '../src/message.js';

const CONFIG = normalizeConfig({
  host: 'smtp.example.com',
  from_email: 'gladys@example.com',
  from_name: 'Gladys Assistant',
});

// A 1x1 transparent GIF, small enough to inline in a test.
const BASE64_IMAGE = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

test('buildSubject summarizes the message with the configured prefix', () => {
  assert.equal(buildSubject('The alarm was triggered', CONFIG), 'Gladys: The alarm was triggered');
});

test('buildSubject only keeps the first non-empty line', () => {
  const subject = buildSubject('\n  Motion detected  \nIn the living room\n', CONFIG);
  assert.equal(subject, 'Gladys: Motion detected');
});

test('buildSubject truncates a long message and stays within the limit', () => {
  const subject = buildSubject('a'.repeat(200), CONFIG);
  assert.ok(subject.length <= MAX_SUBJECT_LENGTH, `subject too long: ${subject.length}`);
  assert.ok(subject.endsWith('…'));
});

test('buildSubject works without a prefix', () => {
  const config = normalizeConfig({ ...CONFIG, subject_prefix: '' });
  assert.equal(buildSubject('Door opened', config), 'Door opened');
});

test('buildSubject falls back when the message has no text (image only)', () => {
  assert.equal(buildSubject('', CONFIG), 'Gladys');
  assert.equal(buildSubject('', normalizeConfig({ subject_prefix: '' })), 'Gladys Assistant');
});

test('parseAttachment returns null when there is no image', () => {
  assert.equal(parseAttachment(null), null);
  assert.equal(parseAttachment(undefined), null);
  assert.equal(parseAttachment('   '), null);
});

test('parseAttachment reads the Gladys camera format', () => {
  const attachment = parseAttachment(`image/jpg;base64,${BASE64_IMAGE}`);
  assert.equal(attachment.content, BASE64_IMAGE);
  assert.equal(attachment.contentType, 'image/jpg');
  assert.equal(attachment.encoding, 'base64');
  assert.equal(attachment.filename, 'gladys-snapshot.jpg');
});

test('parseAttachment also reads a data URL and a bare base64 string', () => {
  assert.equal(parseAttachment(`data:image/png;base64,${BASE64_IMAGE}`).contentType, 'image/png');
  assert.equal(
    parseAttachment(`data:image/png;base64,${BASE64_IMAGE}`).filename,
    'gladys-snapshot.png',
  );
  const bare = parseAttachment(BASE64_IMAGE);
  assert.equal(bare.content, BASE64_IMAGE);
  assert.equal(bare.contentType, 'image/jpeg');
});

test('escapeHtml neutralizes a message that contains markup', () => {
  assert.equal(
    escapeHtml('<script>alert("x")</script>'),
    '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;',
  );
});

test('buildHtml embeds the image inline through its cid', () => {
  const attachment = parseAttachment(BASE64_IMAGE);
  const html = buildHtml('Someone is at the door', attachment);
  assert.ok(html.includes(`cid:${attachment.cid}`));
  assert.ok(html.includes('Someone is at the door'));
});

test('buildHtml keeps the line breaks of the message', () => {
  assert.ok(buildHtml('line 1\nline 2', null).includes('line 1<br />line 2'));
});

test('buildSender uses the display name when there is one', () => {
  assert.deepEqual(buildSender(CONFIG), {
    name: 'Gladys Assistant',
    address: 'gladys@example.com',
  });
  assert.equal(buildSender(normalizeConfig({ from_email: 'a@b.c', from_name: '' })), 'a@b.c');
});

test('buildMail produces a complete email out of a Gladys message', () => {
  const mail = buildMail(
    { email: 'user@example.com' },
    { text: 'The alarm was triggered', file: null },
    CONFIG,
  );
  assert.equal(mail.to, 'user@example.com');
  assert.deepEqual(mail.from, { name: 'Gladys Assistant', address: 'gladys@example.com' });
  assert.equal(mail.subject, 'Gladys: The alarm was triggered');
  assert.equal(mail.text, 'The alarm was triggered');
  assert.ok(mail.html.includes('The alarm was triggered'));
  assert.equal(mail.attachments, undefined);
});

test('buildMail attaches the camera snapshot when the message carries one', () => {
  const mail = buildMail(
    { email: 'user@example.com' },
    { text: 'Motion detected', file: `image/jpg;base64,${BASE64_IMAGE}` },
    CONFIG,
  );
  assert.equal(mail.attachments.length, 1);
  assert.equal(mail.attachments[0].content, BASE64_IMAGE);
  assert.ok(mail.html.includes('cid:gladys-snapshot'));
});

test('buildMail trims the recipient address', () => {
  const mail = buildMail({ email: '  user@example.com ' }, { text: 'hi' }, CONFIG);
  assert.equal(mail.to, 'user@example.com');
});

test('buildMail refuses a contact without an email address', () => {
  assert.throws(() => buildMail({}, { text: 'hi' }, CONFIG), /No email address/);
  assert.throws(() => buildMail({ email: '   ' }, { text: 'hi' }, CONFIG), /No email address/);
});
