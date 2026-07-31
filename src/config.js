// -----------------------------------------------------------------------------
// Integration configuration.
//
// The values are filled in by the user in Gladys, from the `config_schema`
// declared in `gladys-assistant-integration.json`. The SDK fetches them
// (`gladys.getConfig()`) and notifies every change through
// `gladys.onConfigUpdated()`.
//
// This module only holds the defaults, normalizes the received object (a form
// sends numbers as strings) and answers one question the rest of the code asks
// constantly: is this configuration usable to send an email?
// -----------------------------------------------------------------------------

/** Connection security modes offered by the `security` field of the manifest. */
export const SECURITY = {
  /** Plain connection upgraded with STARTTLS — the port 587 default. */
  STARTTLS: 'starttls',
  /** TLS from the first byte (implicit TLS) — the port 465 case. */
  TLS: 'tls',
  /** No encryption at all: only reasonable for a relay on the local network. */
  NONE: 'none',
};

// Defaults: they MUST stay consistent with the `default` values declared in the
// `config_schema` of the manifest (a test enforces it).
export const DEFAULT_CONFIG = {
  host: '',
  port: 587,
  security: SECURITY.STARTTLS,
  username: '',
  password: '',
  from_email: '',
  from_name: 'Gladys Assistant',
  subject_prefix: 'Gladys',
  reject_unauthorized: true,
};

/** Fields without which no email can leave the container. */
export const REQUIRED_KEYS = ['host', 'port', 'from_email'];

function trimmed(value, fallback) {
  return typeof value === 'string' ? value.trim() : (value ?? fallback);
}

/**
 * Merge the user configuration with the defaults and force the types.
 * @param {Record<string, unknown>} raw - Configuration returned by the SDK.
 * @returns {Record<string, unknown>} The normalized configuration.
 */
export function normalizeConfig(raw = {}) {
  const port = Number(raw.port ?? DEFAULT_CONFIG.port);
  const security = String(raw.security ?? DEFAULT_CONFIG.security).toLowerCase();
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    host: trimmed(raw.host, DEFAULT_CONFIG.host),
    // A form can send an empty string: fall back to the default port then.
    port: Number.isFinite(port) && port > 0 ? port : DEFAULT_CONFIG.port,
    security: Object.values(SECURITY).includes(security) ? security : DEFAULT_CONFIG.security,
    username: trimmed(raw.username, DEFAULT_CONFIG.username),
    // The password is a secret: never trimmed, a trailing space may be real.
    password: raw.password ?? DEFAULT_CONFIG.password,
    from_email: trimmed(raw.from_email, DEFAULT_CONFIG.from_email),
    from_name: trimmed(raw.from_name, DEFAULT_CONFIG.from_name),
    subject_prefix: trimmed(raw.subject_prefix, DEFAULT_CONFIG.subject_prefix),
    // A checkbox that was never touched must stay on: only an explicit false
    // disables the certificate verification.
    reject_unauthorized: raw.reject_unauthorized !== false,
  };
}

/**
 * List the mandatory fields the user has not filled in yet.
 * @param {Record<string, unknown>} config - A normalized configuration.
 * @returns {string[]} The missing keys, empty when the configuration is usable.
 */
export function missingConfigKeys(config) {
  return REQUIRED_KEYS.filter((key) => {
    const value = config[key];
    return value === undefined || value === null || value === '';
  });
}

/**
 * @param {Record<string, unknown>} config - A normalized configuration.
 * @returns {boolean} True when the integration can attempt to send an email.
 */
export function isConfigured(config) {
  return missingConfigKeys(config).length === 0;
}
