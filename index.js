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
// This file only bootstraps the SDK: the handlers are wired in src/app.js, the
// email building lives in src/message.js, the SMTP dialogue in src/smtp.js, the
// buttons in src/actions.js.
//
// Environment variables injected by the Gladys supervisor:
//   - GLADYS_HOST_API_URL, GLADYS_INTEGRATION_TOKEN, GLADYS_INTEGRATION_SELECTOR
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { registerHandlers } from './src/app.js';

const gladys = new GladysIntegration();
registerHandlers(gladys);

logger.info('Starting the SMTP integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
