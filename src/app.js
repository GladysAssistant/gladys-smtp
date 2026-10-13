// -----------------------------------------------------------------------------
// The wiring between the SDK and the SMTP code.
//
// `registerHandlers(gladys)` takes the Gladys client as a parameter instead of
// creating it, so the tests can hand it the SDK's own fake Gladys
// (`@gladysassistant/integration-sdk/testing`) and drive the integration exactly
// as Gladys does: a message to deliver, a button clicked, a configuration saved.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { isConfigured, missingConfigKeys, normalizeConfig } from './config.js';
import { buildMail } from './message.js';
import { SmtpClient } from './smtp.js';
import { ACTIONS } from './actions.js';
import { SCENE_ACTIONS } from './sceneActions.js';

const logger = createLogger({ name: 'app' });

/**
 * Register every handler of the integration on a Gladys client. Must run
 * before `gladys.connect()`.
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys - The Gladys client.
 * @param {{createTransport?: Function}} [deps] - Injectable nodemailer factory (tests).
 * @returns {{smtp: SmtpClient}} The SMTP client, exposed for the tests.
 */
export function registerHandlers(gladys, deps = {}) {
  // Current configuration (hot-reloaded through onConfigUpdated).
  let config = normalizeConfig();
  const smtp = new SmtpClient(config, deps);

  /**
   * Swap the configuration: the cached transport is dropped, so the next
   * email uses the new server.
   * @param {Record<string, unknown>} raw - Configuration received from Gladys.
   */
  function applyConfig(raw) {
    config = normalizeConfig(raw);
    smtp.updateConfig(config);
  }

  /**
   * Report the application-level status shown in the Configuration screen. It
   * is distinct from the container state: the integration can be RUNNING while
   * the SMTP server refuses the password. Checking it here — rather than on
   * the first notification — means the user learns about a bad setting while
   * they are looking at the screen, not the day the alarm should have warned
   * them.
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

  // --- Outgoing messages: Gladys asks us to notify a user --------------------
  // `contact` is the target user's `contact_schema` values ({ email }) — Gladys
  // skips the users who have not filled the block in, so a message that
  // reaches us always has a recipient.
  gladys.onSendMessage(async (contact, message) => {
    const mail = buildMail(contact, message, config);
    logger.info(`onSendMessage -> sending an email to ${mail.to}`);
    await smtp.sendMail(mail);
  });

  // --- Manifest actions: the buttons of the Configuration screen -------------
  // Each key of the registry is an `actions` key of the manifest; the resolved
  // message is displayed under the button.
  for (const [key, handler] of Object.entries(ACTIONS)) {
    gladys.onAction(key, (fields) => handler(smtp, config, fields));
  }

  // --- Scene actions: the "Send an email" card of the scene editor ----------
  // `fields` arrive resolved (scene variables substituted, validated by the
  // core); the resolved object carries the declared `outputs`.
  for (const [key, handler] of Object.entries(SCENE_ACTIONS)) {
    gladys.onSceneAction(key, (fields) => handler(smtp, config, fields));
  }

  // --- Configuration updated by the user -------------------------------------
  gladys.onConfigUpdated(async (newConfig) => {
    logger.info('onConfigUpdated -> new configuration received');
    applyConfig(newConfig);
    await refreshConnectionStatus();
  });

  // --- Connection lifecycle --------------------------------------------------
  // The SDK resynchronizes `gladys.config` on every (re)connection before
  // emitting `connected`, and logs the WebSocket lifecycle itself (under the
  // `gladys-sdk` name), so this handler only runs our own (re)initialization.
  gladys.on('connected', async () => {
    try {
      applyConfig(gladys.config);
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

  // --- Graceful shutdown -----------------------------------------------------
  gladys.handleShutdown((signal) => {
    logger.info(`Received ${signal} -> graceful shutdown`);
    smtp.close();
  });

  return { smtp };
}
