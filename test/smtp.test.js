import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SECURITY, normalizeConfig } from '../src/config.js';
import { SmtpClient, buildTransportOptions, describeSmtpError } from '../src/smtp.js';
import { createFakeTransportFactory, smtpError } from './helpers/fakeTransport.js';

const CONFIG = normalizeConfig({
  host: 'smtp.example.com',
  port: 587,
  username: 'bob',
  password: 'secret',
  from_email: 'gladys@example.com',
});

test('STARTTLS is not "secure" for nodemailer, but it is required', () => {
  const options = buildTransportOptions(CONFIG);
  assert.equal(options.secure, false);
  assert.equal(options.requireTLS, true);
  assert.equal(options.ignoreTLS, false);
});

test('implicit TLS (port 465) opens the socket in TLS', () => {
  const options = buildTransportOptions(
    normalizeConfig({ ...CONFIG, security: SECURITY.TLS, port: 465 }),
  );
  assert.equal(options.secure, true);
  assert.equal(options.requireTLS, false);
});

test('an unencrypted relay does not attempt any upgrade', () => {
  const options = buildTransportOptions(normalizeConfig({ ...CONFIG, security: SECURITY.NONE }));
  assert.equal(options.secure, false);
  assert.equal(options.requireTLS, false);
  assert.equal(options.ignoreTLS, true);
});

test('credentials are only sent when a username is configured', () => {
  assert.deepEqual(buildTransportOptions(CONFIG).auth, { user: 'bob', pass: 'secret' });
  const anonymous = normalizeConfig({ host: 'relay.home.lan', from_email: 'g@home.lan' });
  assert.equal(buildTransportOptions(anonymous).auth, undefined);
});

test('the certificate verification setting reaches the TLS options', () => {
  assert.equal(buildTransportOptions(CONFIG).tls.rejectUnauthorized, true);
  const relaxed = normalizeConfig({ ...CONFIG, reject_unauthorized: false });
  assert.equal(buildTransportOptions(relaxed).tls.rejectUnauthorized, false);
});

test('every timeout is set: an action button must not hang forever', () => {
  const options = buildTransportOptions(CONFIG);
  assert.ok(options.connectionTimeout > 0);
  assert.ok(options.greetingTimeout > 0);
  assert.ok(options.socketTimeout > 0);
});

test('describeSmtpError explains the code and keeps the server response', () => {
  const described = describeSmtpError(
    smtpError('EAUTH', 'Invalid login', '535 5.7.8 Bad credentials'),
  );
  assert.match(described, /authentication refused/);
  assert.match(described, /535 5\.7\.8 Bad credentials/);
});

test('describeSmtpError falls back to the raw message for an unknown code', () => {
  assert.equal(describeSmtpError(new Error('Unexpected socket close')), 'Unexpected socket close');
  assert.equal(describeSmtpError(undefined), 'unknown error');
});

test('SmtpClient sends through the transport it built from the configuration', async () => {
  const factory = createFakeTransportFactory();
  const smtp = new SmtpClient(CONFIG, { createTransport: factory });

  await smtp.sendMail({ to: 'user@example.com', subject: 'Hello' });

  assert.equal(factory.state.sent.length, 1);
  assert.equal(factory.state.sent[0].to, 'user@example.com');
  assert.equal(factory.state.options[0].host, 'smtp.example.com');
});

test('SmtpClient reuses the transport instead of reconnecting on every email', async () => {
  const factory = createFakeTransportFactory();
  const smtp = new SmtpClient(CONFIG, { createTransport: factory });

  await smtp.sendMail({ to: 'a@example.com' });
  await smtp.sendMail({ to: 'b@example.com' });

  assert.equal(factory.state.options.length, 1);
});

test('updateConfig closes the old transport and rebuilds it with the new server', async () => {
  const factory = createFakeTransportFactory();
  const smtp = new SmtpClient(CONFIG, { createTransport: factory });
  await smtp.sendMail({ to: 'a@example.com' });

  smtp.updateConfig(normalizeConfig({ ...CONFIG, host: 'smtp.other.com' }));
  await smtp.sendMail({ to: 'b@example.com' });

  assert.equal(factory.state.closed, 1);
  assert.equal(factory.state.options.length, 2);
  assert.equal(factory.state.options[1].host, 'smtp.other.com');
});

test('SmtpClient refuses to send while the configuration is incomplete', async () => {
  const smtp = new SmtpClient(normalizeConfig(), {
    createTransport: createFakeTransportFactory(),
  });
  await assert.rejects(smtp.sendMail({ to: 'a@example.com' }), /not configured yet/);
});

test('a send failure is rethrown as a readable message, keeping the cause', async () => {
  const factory = createFakeTransportFactory({
    sendError: smtpError('EENVELOPE', 'Recipient refused', '550 5.1.1 No such user'),
  });
  const smtp = new SmtpClient(CONFIG, { createTransport: factory });

  await assert.rejects(smtp.sendMail({ to: 'ghost@example.com' }), (error) => {
    assert.match(error.message, /refused the sender or the recipient/);
    assert.equal(error.cause.code, 'EENVELOPE');
    return true;
  });
});

test('verify surfaces an authentication failure as a readable message', async () => {
  const factory = createFakeTransportFactory({
    verifyError: smtpError('EAUTH', 'Invalid login', '535 5.7.8 Bad credentials'),
  });
  const smtp = new SmtpClient(CONFIG, { createTransport: factory });

  await assert.rejects(smtp.verify(), /authentication refused/);
});

test('close releases the transport and is safe to call twice', async () => {
  const factory = createFakeTransportFactory();
  const smtp = new SmtpClient(CONFIG, { createTransport: factory });
  await smtp.verify();

  smtp.close();
  smtp.close();

  assert.equal(factory.state.closed, 1);
  assert.equal(smtp.transport, null);
});
