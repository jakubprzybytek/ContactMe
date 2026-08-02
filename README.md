# ContactMe

A tiny AWS-hosted React app with a single feature: let people contact me through a
contact form. Built with [SST v4](https://sst.dev).

## Architecture

| Piece | Implementation |
| --- | --- |
| Frontend | React + Vite SPA (`packages/web`) deployed as an `sst.aws.StaticSite` (S3 + CloudFront) |
| API | Lambda function URL (`packages/functions/src/contact.ts`), `POST` only |
| Spam protection | Google reCAPTCHA v3, verified server side |
| Email delivery | Amazon SES v2 (`SendEmail`), reply-to set to the sender's address when provided |
| Infrastructure | `sst.config.ts` |
| Delivery | GitHub Actions deploys `main` to the `int` stage |

The form has three fields: **subject** (optional), **message** (required) and
**email** (optional, used as the `Reply-To` address).

## Prerequisites

1. **Amazon SES** — verify the sender identity (`SenderEmail`) in the deployment
   region. While the account is in the SES sandbox the recipient (`ContactEmail`)
   must be verified too; request production access to lift that restriction.
2. **Google reCAPTCHA v3** — register the site at
   <https://www.google.com/recaptcha/admin> and note the site key and secret key.
3. **AWS credentials** for local development and for GitHub Actions.

## Configuration

Only the server-side reCAPTCHA key is stored as an SST secret:

| Secret | Purpose |
| --- | --- |
| `RecaptchaSecretKey` | reCAPTCHA server-side key |

Set it per stage:

```bash
npx sst secret set RecaptchaSecretKey ... --stage int
```

The remaining configuration is supplied as ordinary environment variables:

| Variable | Purpose |
| --- | --- |
| `CONTACT_EMAIL` | Mailbox that receives submissions |
| `SENDER_EMAIL` | SES verified identity used as the `From` address |
| `RECAPTCHA_SITE_KEY` | Public reCAPTCHA key injected into the frontend build |
| `AWS_REGION` | AWS region; defaults to `eu-central-1` |

For local development or deployment, export the three required values before
running SST:

```bash
export CONTACT_EMAIL=me@example.com
export SENDER_EMAIL=no-reply@example.com
export RECAPTCHA_SITE_KEY=...
```

## GitHub Actions configuration

Repository variables:

- `AWS_ROLE_ARN` — IAM role assumed through GitHub OIDC
- `CONTACT_EMAIL`
- `SENDER_EMAIL`
- `RECAPTCHA_SITE_KEY`
- `AWS_REGION`

Repository secret:

- `RECAPTCHA_SECRET_KEY`

## Local development

```bash
npm install
npx sst dev
```

`sst dev` provisions the infrastructure for your personal stage and runs the Vite
dev server with `VITE_API_URL` and `VITE_RECAPTCHA_SITE_KEY` wired up.

## Build, lint and typecheck

```bash
npm run build   # typechecks and builds the frontend
npm run lint    # oxlint on the frontend
```

The Lambda typecheck (`npm run typecheck -w @contact-me/functions`) relies on the
resource types SST generates into `.sst/`, so run `sst dev` or `sst deploy` at
least once before using it.

## Deployment

```bash
npx sst deploy --stage int
```

Pushes to `main` run the same command through
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

## Notes

- The function URL accepts requests from any origin because the CloudFront domain
  of the static site is only known after the function is created. No cookies or
  credentials are used; submissions are gated by reCAPTCHA and validated server
  side (length limits, email format, header-injection stripping).
- Emails are sent as plain text so that submitted content cannot inject HTML into
  the mailbox.
