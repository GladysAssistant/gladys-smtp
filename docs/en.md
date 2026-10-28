# SMTP

## Overview

This integration lets Gladys send emails through **your own SMTP server** —
your mailbox provider (Gmail, Outlook, iCloud, Fastmail…), a transactional
service (Brevo, Mailgun, Postmark, Amazon SES…), or a mail server running on
your local network.

Once installed, "email" becomes a notification channel: your scenes can send
you a message, and Gladys can reach you when you are away from the app.

### How it works

There are two levels of settings, and they are not the same thing:

- **The SMTP server** (the _Configuration_ block) — shared by the whole
  house, set once by the administrator. This is the account Gladys uses to
  _send_.
- **Your email address** (the _My account_ block) — each user of the Gladys
  instance enters their own address, and receives their own notifications
  there. A user who leaves it empty is simply skipped: Gladys never sends
  them an email.

### What an email looks like

The message Gladys sends becomes the body of the email. Its **subject** is
built from the first line of the message (prefixed with your subject prefix),
so a mailbox list stays readable without opening anything.

When the message carries an image — a camera snapshot, for instance — it is
attached to the email and displayed inline in the body.

## Prerequisites

- **Gladys 5.1 or later.**
- **An SMTP account to send from**: the server name, the port, the
  encryption mode and, unless it is a local relay accepting anonymous
  submissions, a username and a password. The settings of the common
  providers are listed below.
- **An app password** for Gmail, Outlook and iCloud, which refuse the account
  password (see below).
- **Network access** from the machine running Gladys to the SMTP server, on
  the port you choose (587, 465 or 25).
- **An email address for each Gladys user** who wants to receive the
  notifications.

## Configuration

### Configuring the SMTP server

1. Open the **Configuration** tab of the integration.
2. Fill in the settings of your provider:
   - **SMTP server**: the hostname, e.g. `smtp.gmail.com`.
   - **Port** and **Encryption**: `587` with **STARTTLS** for most providers,
     `465` with **TLS / SSL** for the others. Use `25` with **None** only for
     a relay on your own network.
   - **Username** and **Password**: the credentials of the sending account.
     Leave both empty for a local relay that accepts anonymous submissions.
   - **Sender address**: the address the emails come from. Most providers
     require it to be the authenticated account itself, otherwise they reject
     the message.
   - **Sender name**: what the recipient sees in their mailbox.
   - **Subject prefix**: prepended to every subject, which is built from the
     first line of the message — leave it empty if you prefer no prefix.
3. Save, then click **Test the SMTP connection**. It opens a session and
   authenticates without sending anything: if it fails, the message under the
   button tells you what the server refused.
4. Click **Send a test email** and check that the email actually arrives —
   including the spam folder, which no connection test can do for you.

#### Settings of the common providers

| Provider            | Server                              | Port | Encryption |
| ------------------- | ----------------------------------- | ---- | ---------- |
| Gmail               | `smtp.gmail.com`                    | 587  | STARTTLS   |
| Outlook / Microsoft | `smtp-mail.outlook.com`             | 587  | STARTTLS   |
| iCloud              | `smtp.mail.me.com`                  | 587  | STARTTLS   |
| Fastmail            | `smtp.fastmail.com`                 | 465  | TLS / SSL  |
| Brevo               | `smtp-relay.brevo.com`              | 587  | STARTTLS   |
| Mailgun             | `smtp.mailgun.org`                  | 587  | STARTTLS   |
| Amazon SES          | `email-smtp.<region>.amazonaws.com` | 587  | STARTTLS   |

> **Gmail, Outlook and iCloud refuse your account password.** They require an
> **app password**: enable two-factor authentication on the account, generate
> a dedicated password for Gladys, and paste that one in the **Password**
> field. Revoking it later disables Gladys only, not your account.

### Receiving the notifications

1. Still in the **Configuration** tab, find the **My account** block.
2. Enter **your** email address and save.
3. Every Gladys user does the same, each with their own address.

## Sending an email from a scene

The notifications only reach Gladys users, at their own address. To write to
anyone else — a neighbour, a shared mailbox, the property manager — add the
**Send an email** action to a scene (category _Integrations_ of the action
picker):

- **Recipients**: one address, or several separated by commas (10 at most).
- **Subject**: optional. When empty, the first line of the message is used.
  The subject prefix of the configuration is added in both cases.
- **Message**: the body of the email.

All three fields accept the scene variables, e.g. the temperature that
triggered the scene. The action returns the **Email identifier** (the
`Message-ID`) to the following actions of the scene. If the email cannot be
sent, the action fails and the scene logs the reason, then goes on.

## Troubleshooting

The status of the integration, in its **Configuration** tab, tells you whether
Gladys can reach the SMTP server, and why not.

- **"SMTP server not configured yet."** — the **SMTP server** or **Sender
  address** field is empty. Fill them in and save. An empty **Port** is not
  reported: the integration uses 587 instead.
- **"authentication refused by the server"** — wrong username or password. On
  Gmail, Outlook and iCloud, this is almost always the account password used
  instead of an app password.
- **"cannot reach the server"** — wrong hostname or port, or a firewall
  blocking outgoing SMTP. Some ISPs block port 25 for residential lines: use
  587 or 465.
- **"the server hostname could not be resolved"** — the **SMTP server** name
  is misspelled, or the machine running Gladys cannot resolve it.
- **"the server did not answer in time"** — the server is down or a firewall
  silently drops the connection. Check the server name and the port.
- **"the TLS handshake failed"** — the encryption mode does not match the
  port. Port 465 needs **TLS / SSL**, port 587 needs **STARTTLS**.
- **"the server refused the sender or the recipient address"** — the sender
  address is not the authenticated account, or the recipient address is
  invalid.
- **A local mail server with a self-signed certificate** — turn off **Verify
  the TLS certificate**. Leave it on in every other case.
- **The emails go to spam** — add the sender address to your contacts, or use
  a domain with SPF/DKIM records if you own one.

The integration logs everything it does: open the integration logs from the
Gladys UI (the **Logs** of the integration, on its page), or `docker logs` on
the host, with `LOG_LEVEL=debug` for the full detail of the SMTP dialogue.
