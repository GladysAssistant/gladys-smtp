// -----------------------------------------------------------------------------
// The SMTP client.
//
// Everything that talks to the mail server lives here: building the nodemailer
// transport out of the user configuration, verifying it, sending an email, and
// turning the raw errors of an SMTP dialogue into something a user reading the
// Configuration screen can act on.
//
// The transport is created lazily and cached: a notification integration is
// idle most of the time, and the configuration can change under us at any
// moment (`onConfigUpdated`).
// -----------------------------------------------------------------------------

import nodemailer from 'nodemailer';
import { createLogger } from '@gladysassistant/integration-sdk';
import { SECURITY, isConfigured, missingConfigKeys } from './config.js';

const logger = createLogger({ name: 'smtp' });

/** Give up rather than hold an action button hostage: an ack is awaited. */
const TIMEOUTS = {
  connection: 15000,
  greeting: 15000,
  socket: 30000,
};

/**
 * Translate the configuration into nodemailer transport options.
 * @param {Record<string, unknown>} config - The normalized configuration.
 * @returns {object} The nodemailer transport options.
 */
export function buildTransportOptions(config) {
  const options = {
    host: config.host,
    port: config.port,
    // `secure` means TLS from the first byte (port 465). STARTTLS starts in
    // clear text and upgrades, so it is NOT "secure: true" for nodemailer.
    secure: config.security === SECURITY.TLS,
    // Refuse to fall back to clear text when the user asked for STARTTLS.
    requireTLS: config.security === SECURITY.STARTTLS,
    ignoreTLS: config.security === SECURITY.NONE,
    connectionTimeout: TIMEOUTS.connection,
    greetingTimeout: TIMEOUTS.greeting,
    socketTimeout: TIMEOUTS.socket,
    tls: {
      // Off only for a local server with a self-signed certificate.
      rejectUnauthorized: config.reject_unauthorized !== false,
    },
  };

  // No username: an anonymous relay (a mail server on the LAN). Sending an
  // empty AUTH would make such a server reject the session.
  if (config.username) {
    options.auth = { user: config.username, pass: config.password ?? '' };
  }

  return options;
}

/**
 * Make an SMTP failure readable. nodemailer surfaces the server dialogue in
 * `response`/`responseCode` and its own diagnosis in `code`; the raw
 * `error.message` alone often says nothing useful ("Unexpected socket close").
 * @param {Error & {code?: string, response?: string, responseCode?: number}} error - The error thrown by nodemailer.
 * @returns {string} A single-line explanation.
 */
export function describeSmtpError(error) {
  const hints = {
    EAUTH: 'authentication refused by the server (wrong username or password?)',
    ECONNECTION: 'cannot reach the server (wrong host, port, or blocked by a firewall?)',
    ETIMEDOUT: 'the server did not answer in time',
    ESOCKET: 'the TLS handshake failed (wrong encryption mode for this port?)',
    EDNS: 'the server hostname could not be resolved',
    EENVELOPE: 'the server refused the sender or the recipient address',
  };
  const hint = hints[error?.code];
  const response = error?.response?.trim();
  const detail = response || error?.message || 'unknown error';
  return hint ? `${hint} — ${detail}` : detail;
}

/**
 * A lazily-built, configuration-aware SMTP transport.
 */
export class SmtpClient {
  /**
   * @param {Record<string, unknown>} config - The normalized configuration.
   * @param {{createTransport?: Function}} [deps] - Injectable nodemailer factory (tests).
   */
  constructor(config, { createTransport = nodemailer.createTransport } = {}) {
    this.config = config;
    this.createTransport = createTransport;
    this.transport = null;
  }

  /**
   * Replace the configuration; the transport is rebuilt on the next send.
   * @param {Record<string, unknown>} config - The new normalized configuration.
   */
  updateConfig(config) {
    this.config = config;
    this.close();
  }

  /**
   * @returns {object} The cached transport, built on first use.
   * @throws {Error} When the configuration is not usable yet.
   */
  getTransport() {
    if (!isConfigured(this.config)) {
      throw new Error(
        `SMTP is not configured yet (missing: ${missingConfigKeys(this.config).join(', ')})`,
      );
    }
    if (!this.transport) {
      logger.debug(`Creating the SMTP transport for ${this.config.host}:${this.config.port}`);
      this.transport = this.createTransport(buildTransportOptions(this.config));
    }
    return this.transport;
  }

  /**
   * Open a connection and authenticate, without sending anything.
   * @returns {Promise<void>} Resolves when the server accepted the session.
   */
  async verify() {
    const transport = this.getTransport();
    try {
      await transport.verify();
    } catch (error) {
      throw new Error(describeSmtpError(error), { cause: error });
    }
  }

  /**
   * Send one email.
   * @param {object} mail - A nodemailer mail object.
   * @returns {Promise<object>} The nodemailer send result.
   */
  async sendMail(mail) {
    const transport = this.getTransport();
    try {
      const info = await transport.sendMail(mail);
      logger.info(`Email sent to ${mail.to} (${info?.messageId ?? 'no message id'})`);
      return info;
    } catch (error) {
      logger.error(`Email to ${mail.to} failed: ${describeSmtpError(error)}`);
      throw new Error(describeSmtpError(error), { cause: error });
    }
  }

  /** Release the pooled sockets, e.g. on shutdown or a configuration change. */
  close() {
    try {
      this.transport?.close?.();
    } catch (error) {
      logger.debug(`Closing the SMTP transport failed: ${error.message}`);
    }
    this.transport = null;
  }
}
