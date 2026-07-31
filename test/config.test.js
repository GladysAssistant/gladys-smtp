import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG,
  SECURITY,
  isConfigured,
  missingConfigKeys,
  normalizeConfig,
} from '../src/config.js';

test('normalizeConfig returns the defaults when called with no argument', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
});

test('normalizeConfig keeps the user values over the defaults', () => {
  const config = normalizeConfig({
    host: 'smtp.example.com',
    from_email: 'gladys@example.com',
    from_name: 'Home',
  });
  assert.equal(config.host, 'smtp.example.com');
  assert.equal(config.from_email, 'gladys@example.com');
  assert.equal(config.from_name, 'Home');
});

test('normalizeConfig coerces the port coming from a form as a string', () => {
  const config = normalizeConfig({ port: '465' });
  assert.equal(config.port, 465);
  assert.equal(typeof config.port, 'number');
});

test('normalizeConfig falls back to the default port for an unusable value', () => {
  assert.equal(normalizeConfig({ port: '' }).port, DEFAULT_CONFIG.port);
  assert.equal(normalizeConfig({ port: 'smtp' }).port, DEFAULT_CONFIG.port);
  assert.equal(normalizeConfig({ port: 0 }).port, DEFAULT_CONFIG.port);
});

test('normalizeConfig trims the values a copy-paste brought spaces into', () => {
  const config = normalizeConfig({ host: '  smtp.example.com  ', username: ' bob ' });
  assert.equal(config.host, 'smtp.example.com');
  assert.equal(config.username, 'bob');
});

test('normalizeConfig never trims the password: a trailing space can be real', () => {
  assert.equal(normalizeConfig({ password: ' secret ' }).password, ' secret ');
});

test('normalizeConfig only accepts a known security mode', () => {
  assert.equal(normalizeConfig({ security: 'TLS' }).security, SECURITY.TLS);
  assert.equal(normalizeConfig({ security: 'none' }).security, SECURITY.NONE);
  assert.equal(normalizeConfig({ security: 'ssl-maybe' }).security, DEFAULT_CONFIG.security);
});

test('certificate verification stays on unless it is explicitly turned off', () => {
  assert.equal(normalizeConfig().reject_unauthorized, true);
  assert.equal(normalizeConfig({ reject_unauthorized: true }).reject_unauthorized, true);
  assert.equal(normalizeConfig({ reject_unauthorized: false }).reject_unauthorized, false);
});

test('missingConfigKeys lists what still blocks a send', () => {
  assert.deepEqual(missingConfigKeys(normalizeConfig()), ['host', 'from_email']);
  assert.deepEqual(missingConfigKeys(normalizeConfig({ host: 'smtp.example.com' })), [
    'from_email',
  ]);
});

test('isConfigured is true as soon as the mandatory fields are filled in', () => {
  assert.equal(isConfigured(normalizeConfig()), false);
  const config = normalizeConfig({ host: 'smtp.example.com', from_email: 'gladys@example.com' });
  assert.equal(isConfigured(config), true);
});

test('an anonymous relay is a valid configuration (no username, no password)', () => {
  const config = normalizeConfig({
    host: '192.168.1.10',
    port: 25,
    security: SECURITY.NONE,
    from_email: 'gladys@home.lan',
  });
  assert.equal(isConfigured(config), true);
  assert.equal(config.username, '');
});
