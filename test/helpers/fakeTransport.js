// -----------------------------------------------------------------------------
// Minimal in-memory stand-in for a nodemailer transport.
//
// SmtpClient takes its `createTransport` as a dependency precisely so the tests
// can drive the SMTP dialogue without a mail server: record what was sent, or
// fail on demand with a realistic nodemailer error.
// -----------------------------------------------------------------------------

/**
 * @param {{verifyError?: Error, sendError?: Error}} [behaviour] - What the fake server does.
 * @returns {object} A factory usable as `createTransport`, carrying the recorded calls.
 */
export function createFakeTransportFactory({ verifyError, sendError } = {}) {
  const state = {
    options: [],
    sent: [],
    verified: 0,
    closed: 0,
  };

  const factory = (options) => {
    state.options.push(options);
    return {
      async verify() {
        state.verified += 1;
        if (verifyError) {
          throw verifyError;
        }
        return true;
      },
      async sendMail(mail) {
        if (sendError) {
          throw sendError;
        }
        state.sent.push(mail);
        return { messageId: `<test-${state.sent.length}@gladys>` };
      },
      close() {
        state.closed += 1;
      },
    };
  };

  factory.state = state;
  return factory;
}

/**
 * Build an error shaped like the ones nodemailer throws.
 * @param {string} code - The nodemailer error code (EAUTH, ECONNECTION...).
 * @param {string} message - The error message.
 * @param {string} [response] - The raw SMTP server response.
 * @returns {Error} The error.
 */
export function smtpError(code, message, response) {
  const error = new Error(message);
  error.code = code;
  if (response) {
    error.response = response;
  }
  return error;
}
