// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The store indexer validates the manifest against its JSON Schema, but nothing
// there can know which handlers the code registers, nor which contact field it
// reads — these tests keep the declaration and the implementation in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ACTIONS } from '../src/actions.js';
import { DEFAULT_CONFIG } from '../src/config.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

test('SMTP is declared as a send-only communication channel', () => {
  assert.equal(manifest.type, 'communication');
  assert.deepEqual(manifest.messaging, { receive: false });
  // A send-only channel has no incoming path, so Gladys needs a per-user
  // identity: contact_schema is mandatory (and forbidden otherwise).
  assert.ok(Array.isArray(manifest.contact_schema) && manifest.contact_schema.length > 0);
});

test('SMTP declares a single transport, so Gladys shows no "prefer local" toggle', () => {
  // The integration talks to the one SMTP server the user configures: there is
  // no local/cloud alternative to choose between per device.
  assert.deepEqual(manifest.transports, ['cloud']);
});

test('the contact field the code reads is the one the manifest declares', () => {
  const email = manifest.contact_schema.find((field) => field.key === 'email');
  assert.ok(email, 'buildMail() reads contact.email: the manifest must declare it');
  assert.equal(email.type, 'string');
  assert.equal(email.required, true);
});

test('every manifest action has a registered handler, and vice versa', () => {
  const declared = (manifest.actions ?? []).map((action) => action.key).sort();
  assert.deepEqual(declared, Object.keys(ACTIONS).sort());
});

test('the send_test_email form declares the field the handler reads', () => {
  const action = manifest.actions.find((a) => a.key === 'send_test_email');
  const recipient = action.fields.find((field) => field.key === 'to');
  assert.ok(recipient, 'sendTestEmail() reads fields.to');
  assert.equal(recipient.required, true);
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  for (const field of manifest.config_schema) {
    if (field.default !== undefined) {
      assert.deepEqual(
        DEFAULT_CONFIG[field.key],
        field.default,
        `DEFAULT_CONFIG.${field.key} must match the manifest default`,
      );
    }
  }
});

test('every configuration key the code defaults is declared in the manifest', () => {
  const declared = new Set(manifest.config_schema.map((field) => field.key));
  for (const key of Object.keys(DEFAULT_CONFIG)) {
    assert.ok(declared.has(key), `DEFAULT_CONFIG.${key} has no field in config_schema`);
  }
});

test('the password is a secret without a default (the manifest is public)', () => {
  const password = manifest.config_schema.find((field) => field.key === 'password');
  assert.equal(password.type, 'secret');
  assert.equal(password.default, undefined, 'a secret field cannot carry a default');
});

test('the security options are exactly the modes the code implements', () => {
  const security = manifest.config_schema.find((field) => field.key === 'security');
  assert.deepEqual(security.options.map((option) => option.value).sort(), [
    'none',
    'starttls',
    'tls',
  ]);
});

test('section fields are purely presentational', () => {
  for (const section of manifest.config_schema.filter((f) => f.type === 'section')) {
    assert.equal(section.required, undefined, `section "${section.key}" must not be required`);
    assert.equal(section.default, undefined, `section "${section.key}" must not have a default`);
    assert.ok(section.label?.en, `section "${section.key}" needs an English label`);
    assert.ok(
      !(section.key in DEFAULT_CONFIG),
      `section "${section.key}" stores no value and must not appear in DEFAULT_CONFIG`,
    );
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//, 'section links must be https');
    }
  }
});

test('the manifest version and the docker image tag stay in lockstep', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(manifest.version, pkg.version);
  assert.ok(
    manifest.docker_image.endsWith(`:${manifest.version}`),
    `docker_image must be tagged ${manifest.version}, got ${manifest.docker_image}`,
  );
});

test('every label and description carries at least English', () => {
  const fields = [
    ...manifest.config_schema,
    ...manifest.contact_schema,
    ...manifest.actions,
    ...manifest.actions.flatMap((action) => action.fields ?? []),
  ];
  for (const field of fields) {
    assert.ok(field.label.en, `"${field.key}" needs an English label`);
    if (field.description) {
      assert.ok(field.description.en, `"${field.key}" needs an English description`);
    }
  }
});
