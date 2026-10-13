import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig } from '../src/config.js';
import { SmtpClient } from '../src/smtp.js';
import { MAX_RECIPIENTS, parseRecipients, sendEmail } from '../src/sceneActions.js';
import { createFakeTransportFactory, smtpError } from './helpers/fakeTransport.js';

const CONFIG = normalizeConfig({
  host: 'smtp.example.com',
  username: 'bob',
  password: 'secret',
  from_email: 'gladys@example.com',
});

function client(behaviour) {
  const factory = createFakeTransportFactory(behaviour);
  return { factory, smtp: new SmtpClient(CONFIG, { createTransport: factory }) };
}

test('parseRecipients accepts one address or a comma / semicolon separated list', () => {
  assert.deepEqual(parseRecipients(' alice@example.com '), ['alice@example.com']);
  assert.deepEqual(parseRecipients('alice@example.com, bob@example.org;carol@example.net,'), [
    'alice@example.com',
    'bob@example.org',
    'carol@example.net',
  ]);
});

test('parseRecipients rejects what is not a plain list of addresses', () => {
  assert.throws(() => parseRecipients(''), /No recipient/);
  assert.throws(() => parseRecipients(' , ; '), /No recipient/);
  assert.throws(() => parseRecipients(undefined), /No recipient/);
  assert.throws(() => parseRecipients('not-an-address'), /Invalid recipient.*not-an-address/);
  assert.throws(() => parseRecipients('Alice <alice@example.com>'), /Invalid recipient/);
  assert.throws(() => parseRecipients('a@b@example.com'), /Invalid recipient/);
  const tooMany = Array.from({ length: MAX_RECIPIENTS + 1 }, (_, i) => `u${i}@example.com`);
  assert.throws(() => parseRecipients(tooMany.join(',')), /Too many recipients/);
});

test('send_email sends the scene message to every recipient and returns the Message-ID', async () => {
  const { smtp, factory } = client();

  const outputs = await sendEmail(smtp, CONFIG, {
    to: 'alice@example.com; bob@example.org',
    subject: 'Water leak',
    body: 'Water detected in the basement.\nCheck the boiler.',
  });

  assert.deepEqual(outputs, { message_id: '<test-1@gladys>' });
  const [mail] = factory.state.sent;
  assert.equal(mail.to, 'alice@example.com, bob@example.org');
  assert.equal(mail.subject, 'Gladys: Water leak');
  assert.equal(mail.text, 'Water detected in the basement.\nCheck the boiler.');
  assert.deepEqual(mail.from, { name: 'Gladys Assistant', address: 'gladys@example.com' });
});

test('send_email derives the subject from the message when none is given', async () => {
  const { smtp, factory } = client();

  await sendEmail(smtp, CONFIG, { to: 'alice@example.com', body: 'Door left open\nsince 10 min' });

  assert.equal(factory.state.sent[0].subject, 'Gladys: Door left open');
});

test('send_email keeps a scene-provided subject on one line', async () => {
  const { smtp, factory } = client();

  await sendEmail(smtp, CONFIG, {
    to: 'alice@example.com',
    subject: 'Alarm\r\nBcc: attacker@example.com',
    body: 'Hi',
  });

  assert.equal(factory.state.sent[0].subject, 'Gladys: Alarm');
});

test('send_email refuses an empty email before dialing the server', async () => {
  const { smtp, factory } = client();

  await assert.rejects(
    sendEmail(smtp, CONFIG, { to: 'alice@example.com', subject: ' ', body: ' ' }),
    /neither a subject nor a message/,
  );
  await assert.rejects(sendEmail(smtp, CONFIG, { to: 'nope', body: 'Hi' }), /Invalid recipient/);
  assert.equal(factory.state.options.length, 0);
});

test('send_email reports a readable SMTP failure', async () => {
  const { smtp } = client({ sendError: smtpError('EENVELOPE', 'No recipients defined') });

  await assert.rejects(
    sendEmail(smtp, CONFIG, { to: 'alice@example.com', body: 'Hi' }),
    /refused the sender or the recipient/,
  );
});

test('send_email tells the scene the integration is not configured', async () => {
  const smtp = new SmtpClient(normalizeConfig(), { createTransport: createFakeTransportFactory() });

  await assert.rejects(
    sendEmail(smtp, normalizeConfig(), { to: 'alice@example.com', body: 'Hi' }),
    /not configured yet/,
  );
});
