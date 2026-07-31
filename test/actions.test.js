import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig } from '../src/config.js';
import { SmtpClient } from '../src/smtp.js';
import { sendTestEmail, testConnection } from '../src/actions.js';
import { createFakeTransportFactory, smtpError } from './helpers/fakeTransport.js';

const CONFIG = normalizeConfig({
  host: 'smtp.example.com',
  username: 'bob',
  password: 'secret',
  from_email: 'gladys@example.com',
});

test('test_connection opens a session without sending anything', async () => {
  const factory = createFakeTransportFactory();
  const smtp = new SmtpClient(CONFIG, { createTransport: factory });

  const message = await testConnection(smtp, CONFIG);

  assert.equal(factory.state.verified, 1);
  assert.equal(factory.state.sent.length, 0);
  assert.match(message.en, /smtp\.example\.com:587/);
  assert.match(message.fr, /bob/);
});

test('test_connection reports the SMTP failure as it is shown under the button', async () => {
  const factory = createFakeTransportFactory({
    verifyError: smtpError('ECONNECTION', 'connect ECONNREFUSED'),
  });
  const smtp = new SmtpClient(CONFIG, { createTransport: factory });

  await assert.rejects(testConnection(smtp, CONFIG), /cannot reach the server/);
});

test('both actions tell the user what is missing instead of failing on the wire', async () => {
  const smtp = new SmtpClient(normalizeConfig(), { createTransport: createFakeTransportFactory() });

  await assert.rejects(testConnection(smtp, normalizeConfig()), /missing: host, from_email/);
  await assert.rejects(
    sendTestEmail(smtp, normalizeConfig(), { to: 'a@b.c' }),
    /missing: host, from_email/,
  );
});

test('send_test_email sends a real email to the address typed in the form', async () => {
  const factory = createFakeTransportFactory();
  const smtp = new SmtpClient(CONFIG, { createTransport: factory });

  const message = await sendTestEmail(smtp, CONFIG, { to: ' user@example.com ' });

  assert.equal(factory.state.sent.length, 1);
  const mail = factory.state.sent[0];
  assert.equal(mail.to, 'user@example.com');
  assert.deepEqual(mail.from, { name: 'Gladys Assistant', address: 'gladys@example.com' });
  assert.match(mail.subject, /^Gladys: /);
  assert.ok(mail.text.length > 0);
  assert.match(message.en, /user@example\.com/);
});

test('send_test_email asks for a recipient when the field is left empty', async () => {
  const smtp = new SmtpClient(CONFIG, { createTransport: createFakeTransportFactory() });

  await assert.rejects(sendTestEmail(smtp, CONFIG, { to: '  ' }), /recipient email address/);
  await assert.rejects(sendTestEmail(smtp, CONFIG), /recipient email address/);
});
