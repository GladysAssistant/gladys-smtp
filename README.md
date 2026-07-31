# Gladys SMTP integration

Send emails from [Gladys Assistant](https://gladysassistant.com) through any
SMTP server — your mailbox provider, a transactional service, or a mail server
on your LAN.

Built on the JavaScript SDK
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
from the official
[integration template](https://github.com/GladysAssistant/integration-template-js).

User documentation: [`docs/en.md`](./docs/en.md) · [`docs/fr.md`](./docs/fr.md)

## What it is

SMTP is a **send-only communication channel** (manifest `type: "communication"`
with `messaging: { receive: false }`): there is no incoming path, no linking
code, no device. Gladys hands the integration a message and a recipient, and
the integration turns it into an email.

That shape drives the two levels of configuration:

| Where                           | What                                                         | Who fills it      |
| ------------------------------- | ------------------------------------------------------------ | ----------------- |
| `config_schema` (Configuration) | the SMTP server: host, port, encryption, credentials, sender | the administrator |
| `contact_schema` (My account)   | one email address per Gladys user                            | each user         |

Gladys passes the user's `contact_schema` values to `onSendMessage` with every
message, and skips the users who left the block empty — so a message that
reaches the integration always has a recipient.

## Project structure

```
.
├─ index.js                          # SDK bootstrap + event wiring (no SMTP logic)
├─ src/
│  ├─ config.js                      # config defaults, normalization, "is it usable?"
│  ├─ message.js                     # Gladys message -> email (subject, HTML, attachment)
│  ├─ smtp.js                        # nodemailer transport, verify/send, readable errors
│  └─ actions.js                     # the two buttons of the Configuration screen
├─ docs/
│  ├─ en.md                          # user documentation, re-hosted by Gladys and
│  └─ fr.md                          #   linked from the Configuration screen
├─ gladys-assistant-integration.json # manifest (config schema, contact schema, actions)
├─ Dockerfile                        # Node 24 Alpine, read-only rootfs ready
└─ .github/workflows/                # CI + multi-arch build + UI-driven release
```

### How a message becomes an email

`src/message.js` holds every decision, as pure functions:

- **Subject** — the first non-empty line of the message, truncated, behind the
  configured prefix (`Gladys: The alarm was triggered`). A fixed subject on
  every notification would make the inbox unreadable.
- **Body** — the message text as the `text` part, plus a small HTML part that
  keeps the line breaks (and escapes anything that looks like markup).
- **Attachment** — `message.file` (a camera snapshot, base64) is attached and
  embedded inline in the HTML through its `cid`. The `image/jpg;base64,…`,
  `data:` and bare-base64 shapes are all accepted.

### How the SMTP settings map to nodemailer

`src/smtp.js` is the only place that talks to the mail server. The subtlety
worth knowing: **STARTTLS is not `secure: true`**. `secure` means TLS from the
first byte (port 465); STARTTLS starts in clear text and upgrades, so it is
`secure: false` **+** `requireTLS: true` — which also refuses a silent
downgrade to clear text. `none` sets `ignoreTLS` and is only reasonable for a
relay on your own network.

SMTP errors are translated before they leave the module (`describeSmtpError`):
`EAUTH` becomes "authentication refused by the server (wrong username or
password?)" followed by the raw server response. Those sentences are what the
user reads under the action buttons and in the connection status, so they have
to be actionable, not `Error: Unexpected socket close`.

## Actions

Both are rendered as buttons in the Configuration screen:

- **Test the SMTP connection** — opens a session and authenticates, without
  sending anything. Answers "did I type my password right?" immediately.
- **Send a test email** — sends a real email to an address typed in the form,
  because only a real delivery proves the spam folder is not where the
  notifications will land.

## Run it locally

```bash
npm install
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="smtp" \
LOG_LEVEL=debug \
npm start
```

The three `GLADYS_*` variables are injected by the Gladys supervisor when the
integration runs inside its sandboxed container; the SDK reads them
automatically.

## Quality checks

```bash
npm run format:check   # Prettier: is everything formatted?
npm run lint           # ESLint: catch real mistakes
npm test               # Unit tests, via the built-in `node --test` runner
```

The same three gates run on every push and pull request
([`.github/workflows/ci.yml`](.github/workflows/ci.yml)). The tests cover the
configuration normalization, the email building, the transport options and the
actions — the SMTP dialogue itself is driven through an injected fake
transport, so `npm test` needs no mail server.

## Validate before publishing

```bash
npx github:GladysAssistant/integration-store .
```

Runs the exact checks of the store indexer (manifest schema, Docker image,
cover, mandatory documentation) and reports every problem at once.

## Release

**Actions → Release → Run workflow**, pick `patch`, `minor` or `major`: the
workflow bumps the version everywhere (`package.json` + manifest `version` and
`docker_image`), pushes the `vX.Y.Z` tag and builds the `linux/amd64` +
`linux/arm64` image to `ghcr.io`. The decentralized indexer then offers the
update in every Gladys.

## Notes

- Requires **Node.js ≥ 20**.
- `cover.png` is the catalog cover (800×534, ≤150 KB, PNG or JPEG).
- Texts are capped at 4096 characters by Gladys (contract B.15).

## License

Apache-2.0
