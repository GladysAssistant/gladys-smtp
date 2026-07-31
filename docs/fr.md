# SMTP

Cette intégration permet à Gladys d'envoyer des emails via **votre propre
serveur SMTP** — votre fournisseur de messagerie (Gmail, Outlook, iCloud,
Fastmail…), un service transactionnel (Brevo, Mailgun, Postmark, Amazon SES…)
ou un serveur mail installé sur votre réseau local.

Une fois installée, « email » devient un canal de notification : vos scénarios
peuvent vous envoyer un message, et Gladys peut vous joindre même quand vous
n'êtes pas devant l'application.

## Comment ça marche

Il y a deux niveaux de réglages, et ce ne sont pas les mêmes :

- **Le serveur SMTP** (bloc _Configuration_) — commun à toute la maison,
  renseigné une seule fois par l'administrateur. C'est le compte que Gladys
  utilise pour _envoyer_.
- **Votre adresse email** (bloc _Mon compte_) — chaque utilisateur de
  l'instance Gladys renseigne sa propre adresse et y reçoit ses propres
  notifications. Un utilisateur qui laisse le champ vide est simplement
  ignoré : Gladys ne lui envoie jamais d'email.

## Configurer le serveur SMTP

1. Ouvrez l'onglet **Configuration** de l'intégration.
2. Renseignez les réglages de votre fournisseur :
   - **Serveur SMTP** : le nom d'hôte, par exemple `smtp.gmail.com`.
   - **Port** et **Chiffrement** : `587` avec **STARTTLS** chez la plupart des
     fournisseurs, `465` avec **TLS / SSL** chez les autres. N'utilisez `25`
     avec **Aucun** que pour un relais sur votre propre réseau.
   - **Nom d'utilisateur** et **Mot de passe** : les identifiants du compte
     expéditeur. Laissez les deux vides pour un relais local acceptant les
     envois anonymes.
   - **Adresse d'expédition** : l'adresse depuis laquelle partent les emails.
     La plupart des fournisseurs exigent qu'elle corresponde au compte
     authentifié, sinon ils rejettent le message.
   - **Nom de l'expéditeur** : ce que voit le destinataire dans sa boîte.
   - **Préfixe du sujet** : ajouté devant chaque sujet, lui-même construit à
     partir de la première ligne du message — laissez vide si vous n'en
     voulez pas.
3. Enregistrez, puis cliquez sur **Tester la connexion SMTP**. Le bouton ouvre
   une session et s'authentifie sans rien envoyer : en cas d'échec, le message
   affiché en dessous indique ce que le serveur a refusé.
4. Cliquez sur **Envoyer un email de test** et vérifiez qu'il arrive bien —
   y compris dans les spams, ce qu'aucun test de connexion ne peut faire à
   votre place.

### Réglages des fournisseurs courants

| Fournisseur         | Serveur                             | Port | Chiffrement |
| ------------------- | ----------------------------------- | ---- | ----------- |
| Gmail               | `smtp.gmail.com`                    | 587  | STARTTLS    |
| Outlook / Microsoft | `smtp-mail.outlook.com`             | 587  | STARTTLS    |
| iCloud              | `smtp.mail.me.com`                  | 587  | STARTTLS    |
| Fastmail            | `smtp.fastmail.com`                 | 465  | TLS / SSL   |
| Brevo               | `smtp-relay.brevo.com`              | 587  | STARTTLS    |
| Mailgun             | `smtp.mailgun.org`                  | 587  | STARTTLS    |
| Amazon SES          | `email-smtp.<region>.amazonaws.com` | 587  | STARTTLS    |

> **Gmail, Outlook et iCloud refusent le mot de passe de votre compte.** Ils
> imposent un **mot de passe d'application** : activez la double
> authentification sur le compte, générez un mot de passe dédié à Gladys, et
> collez celui-ci dans le champ **Mot de passe**. Le révoquer plus tard coupe
> Gladys uniquement, pas votre compte.

## Recevoir les notifications

1. Toujours dans l'onglet **Configuration**, repérez le bloc **Mon compte**.
2. Saisissez **votre** adresse email et enregistrez.
3. Chaque utilisateur de Gladys fait de même, avec sa propre adresse.

## À quoi ressemble un email

Le message envoyé par Gladys devient le corps de l'email. Son **sujet** est
construit à partir de la première ligne du message (précédée de votre préfixe),
pour qu'une liste de boîte de réception reste lisible sans rien ouvrir.

Quand le message contient une image — une capture de caméra par exemple —
elle est jointe à l'email et affichée directement dans le corps du message.

## Dépannage

- **« authentication refused by the server »** — nom d'utilisateur ou mot de
  passe incorrect. Sur Gmail, Outlook et iCloud, c'est presque toujours le mot
  de passe du compte utilisé à la place d'un mot de passe d'application.
- **« cannot reach the server »** — nom d'hôte ou port incorrect, ou pare-feu
  bloquant le SMTP sortant. Certains fournisseurs d'accès bloquent le port 25
  sur les lignes résidentielles : utilisez 587 ou 465.
- **« the TLS handshake failed »** — le mode de chiffrement ne correspond pas
  au port. Le port 465 exige **TLS / SSL**, le port 587 exige **STARTTLS**.
- **« the server refused the sender or the recipient address »** — l'adresse
  d'expédition n'est pas celle du compte authentifié, ou l'adresse du
  destinataire est invalide.
- **Un serveur mail local avec un certificat auto-signé** — désactivez
  **Vérifier le certificat TLS**. Laissez-le activé dans tous les autres cas.
- **Les emails partent en spam** — ajoutez l'adresse d'expédition à vos
  contacts, ou utilisez un domaine avec des enregistrements SPF/DKIM si vous
  en possédez un.

L'intégration journalise tout ce qu'elle fait : ouvrez les logs de
l'intégration depuis l'interface de Gladys (ou `docker logs` sur l'hôte), avec
`LOG_LEVEL=debug` pour le détail complet du dialogue SMTP.
