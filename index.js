// -----------------------------------------------------------------------------
// Entry point of the Gladys SMTP integration.
//
// SMTP is a *send-only communication channel* (manifest `type: "communication"`
// with `messaging: { receive: false }`): there is no incoming path, no linking
// code, no device. The integration does exactly one thing — deliver the
// messages Gladys hands it as emails — plus the two test buttons of the
// Configuration screen.
//
// Two levels of configuration, and they are not the same thing:
//   - the SMTP server itself (`config_schema`), shared by the whole house;
//   - each user's own email address (`contact_schema`), entered in the "My
//     account" block and handed to `onSendMessage` with every message.
//
// This file only wires the SDK: the email building lives in src/message.js, the
// SMTP dialogue in src/smtp.js, the buttons in src/actions.js.
//
// Environment variables injected by the Gladys supervisor:
//   - GLADYS_HOST_API_URL, GLADYS_INTEGRATION_TOKEN, GLADYS_INTEGRATION_SELECTOR
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { isConfigured, missingConfigKeys, normalizeConfig } from './src/config.js';
import { buildMail } from './src/message.js';
import { SmtpClient } from './src/smtp.js';
import { ACTIONS } from './src/actions.js';

const gladys = new GladysIntegration();

// Current configuration (hot-reloaded through onConfigUpdated).
let config = normalizeConfig();
const smtp = new SmtpClient(config);

// --- Outgoing messages: Gladys asks us to notify a user ----------------------
// `contact` is the target user's `contact_schema` values ({ email }) — Gladys
// skips the users who have not filled the block in, so a message that reaches
// us always has a recipient.
gladys.onSendMessage(async (contact, message) => {
  const mail = buildMail(contact, message, config);
  logger.info(`onSendMessage -> sending an email to ${mail.to}`);
  await smtp.sendMail(mail);
});

// --- Manifest actions: the buttons of the Configuration screen ---------------
// Each key of the registry is an `actions` key of the manifest; the resolved
// message is displayed under the button.
for (const [key, handler] of Object.entries(ACTIONS)) {
  gladys.onAction(key, (fields) => handler(smtp, config, fields));
}

// --- Configuration updated by the user ---------------------------------------
gladys.onConfigUpdated(async (newConfig) => {
  logger.info('onConfigUpdated -> new configuration received');
  config = normalizeConfig(newConfig);
  // Drop the cached transport: the next email must use the new server.
  smtp.updateConfig(config);
  await refreshConnectionStatus();
});

// --- Connection lifecycle ----------------------------------------------------
// The SDK logs the WebSocket lifecycle itself (under the `gladys-sdk` name),
// so this handler only runs our own (re)initialization.
gladys.on('connected', async () => {
  try {
    config = normalizeConfig(await gladys.getConfig());
    smtp.updateConfig(config);
    await refreshConnectionStatus();
  } catch (err) {
    logger.error('Post-connection initialization failed', err);
    await gladys
      .setConnectionStatus(false, {
        en: 'Initialization failed, check the integration logs.',
        fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
      })
      .catch(() => {});
  }
});

/**
 * Report the application-level status shown in the Configuration screen. It is
 * distinct from the container state: the integration can be RUNNING while the
 * SMTP server refuses the password. Checking it here — rather than on the first
 * notification — means the user learns about a bad setting while they are
 * looking at the screen, not the day the alarm should have warned them.
 * @returns {Promise<void>} Resolves once the status has been reported.
 */
async function refreshConnectionStatus() {
  if (!isConfigured(config)) {
    const missing = missingConfigKeys(config).join(', ');
    logger.info(`SMTP not configured yet (missing: ${missing})`);
    await gladys.setConnectionStatus(false, {
      en: 'SMTP server not configured yet.',
      fr: 'Serveur SMTP pas encore configuré.',
    });
    return;
  }

  try {
    await smtp.verify();
    logger.info(`SMTP server ${config.host}:${config.port} reachable`);
    await gladys.setConnectionStatus(true);
  } catch (err) {
    logger.error(`SMTP server ${config.host}:${config.port} unreachable: ${err.message}`);
    await gladys.setConnectionStatus(false, {
      en: `SMTP error: ${err.message}`,
      fr: `Erreur SMTP : ${err.message}`,
    });
  }
}

// --- Graceful shutdown -------------------------------------------------------
gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  smtp.close();
});

// --- Startup -----------------------------------------------------------------
logger.info('Starting the SMTP integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
