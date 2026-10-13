import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../src/app.js';
import { createFakeTransportFactory, smtpError } from './helpers/fakeTransport.js';

const CONFIG = {
  host: 'smtp.example.com',
  username: 'bob',
  password: 'secret',
  from_email: 'gladys@example.com',
};

/**
 * Start the integration against the SDK's in-memory Gladys.
 * @param {{config?: object, transport?: object}} [options] - Initial config and fake SMTP server behaviour.
 * @returns {Promise<{gladys: object, factory: Function}>} The connected fake Gladys and the transport factory.
 */
async function start({ config = CONFIG, transport } = {}) {
  const gladys = createFakeGladys({ config });
  const factory = createFakeTransportFactory(transport);
  registerHandlers(gladys, { createTransport: factory });
  await gladys.connect();
  return { gladys, factory };
}

test('on connection, a reachable server is reported connected', async () => {
  const { gladys, factory } = await start();

  assert.equal(factory.state.verified, 1);
  assert.deepEqual(gladys.fake.connectionStatus, { connected: true });
});

test('on connection, a missing configuration is reported, without dialing anything', async () => {
  const { gladys, factory } = await start({ config: {} });

  assert.equal(factory.state.options.length, 0);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /not configured/);
});

test('on connection, an SMTP failure is shown in the Configuration screen', async () => {
  const { gladys } = await start({
    transport: { verifyError: smtpError('EAUTH', 'Invalid login', '535 5.7.8 Bad credentials') },
  });

  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /authentication refused.*535/);
});

test('a Gladys message is delivered as an email to the contact address', async () => {
  const { gladys, factory } = await start();

  const ack = await gladys.fake.sendMessage(
    { email: 'alice@example.com' },
    { text: 'The alarm was triggered', file: null },
  );

  assert.equal(ack.success, true);
  assert.equal(factory.state.sent.length, 1);
  assert.equal(factory.state.sent[0].to, 'alice@example.com');
  assert.equal(factory.state.sent[0].subject, 'Gladys: The alarm was triggered');
});

test('a delivery failure is acked as failed with a readable reason', async () => {
  const { gladys } = await start({
    transport: { sendError: smtpError('EENVELOPE', 'No recipients defined') },
  });

  const ack = await gladys.fake.sendMessage({ email: 'alice@example.com' }, { text: 'Hi' });

  assert.equal(ack.success, false);
  assert.match(ack.error, /refused the sender or the recipient/);
});

test('every manifest action is wired', async () => {
  const { gladys, factory } = await start();

  const connection = await gladys.fake.action('test_connection');
  assert.equal(connection.success, true);
  assert.match(connection.data.message.en, /smtp\.example\.com:587/);

  const email = await gladys.fake.action('send_test_email', { to: 'alice@example.com' });
  assert.equal(email.success, true);
  assert.equal(factory.state.sent.at(-1).to, 'alice@example.com');
});

test('the send_email scene action is wired and returns its outputs', async () => {
  const { gladys, factory } = await start();

  const ack = await gladys.fake.sceneAction('send_email', {
    to: 'neighbour@example.com',
    body: 'Temperature in the greenhouse: 2 °C',
  });

  assert.equal(ack.success, true);
  assert.deepEqual(ack.data.outputs, { message_id: '<test-1@gladys>' });
  assert.equal(factory.state.sent[0].to, 'neighbour@example.com');
});

test('a configuration update rebuilds the transport and refreshes the status', async () => {
  const { gladys, factory } = await start({ config: {} });

  await gladys.fake.configUpdated({ ...CONFIG, host: 'mail.example.org', port: '465' });

  assert.equal(factory.state.options.at(-1).host, 'mail.example.org');
  assert.equal(factory.state.options.at(-1).port, 465);
  assert.deepEqual(gladys.fake.connectionStatus, { connected: true });
});

test('shutdown releases the SMTP transport', async () => {
  const { gladys, factory } = await start();

  await gladys.fake.shutdown();

  assert.ok(factory.state.closed >= 1);
});
