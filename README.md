# ContactMe

A tiny AWS-hosted React app with a single feature: let people contact me through a
contact form. Built with [SST v4](https://sst.dev).

## Architecture

| Piece | Implementation |
| --- | --- |
| Frontend | React + Vite SPA (`packages/web`) deployed as an `sst.aws.StaticSite` (S3 + CloudFront) |
| API | Lambda function URL behind an `sst.aws.Router` custom domain, `POST` only |
| Spam protection | Google reCAPTCHA v3, verified server side |
| Email delivery | Amazon SES v2 (`SendEmail`), reply-to set to the sender's address when provided |
| Infrastructure | `sst.config.ts` |
| Delivery | [Continuous Delivery](.github/workflows/continuous-delivery.yaml): `int`, tests, release tag, `prod` ([docs/development.md](docs/development.md)) |

The form has three fields: **subject** (optional), **message** (required) and
**email** (optional, used as the `Reply-To` address).

## Prerequisites

1. **Amazon SES** — verify the sender identity (`SenderEmail`) in the deployment
   region. While the account is in the SES sandbox the recipient (`ContactEmail`)
   must be verified too; request production access to lift that restriction.
2. **Google reCAPTCHA v3** — register the site at
   <https://www.google.com/recaptcha/admin> and note the site key and secret key.
   Add `contactme.albedoonline.com` (prod) to the reCAPTCHA domain allowlist; `dev` and
   `int` don't use reCAPTCHA.
3. **Amazon Route 53** — create a public hosted zone for `albedoonline.com` in
   the deployment AWS account and point the domain's nameservers at that zone.
   SST creates the DNS validation records, a shared ACM certificate for the web
   and API domains, and their aliases.
4. **AWS credentials** for local development and for GitHub Actions.

## Configuration

Only the server-side reCAPTCHA key is stored as an SST secret:

| Secret | Purpose |
| --- | --- |
| `RecaptchaSecretKey` | reCAPTCHA server-side key |

Only prod uses it (the pipeline sets it from the GitHub secret `RECAPTCHA_SECRET_KEY`):

```bash
npx sst secret set RecaptchaSecretKey ... --stage prod
```

The remaining configuration is supplied as ordinary environment variables:

| Variable | Purpose |
| --- | --- |
| `CONTACT_EMAIL` | Mailbox that receives submissions |
| `SENDER_EMAIL` | SES verified identity used as the `From` address |
| `RECAPTCHA_SITE_KEY` | Public reCAPTCHA key injected into the frontend build |
| `AWS_REGION` | AWS region; defaults to `eu-west-1` |

prod needs these three at deploy time; `dev` and `int` need none of them:

```bash
export CONTACT_EMAIL=me@example.com
export SENDER_EMAIL=no-reply@example.com
export RECAPTCHA_SITE_KEY=...
```

## GitHub Actions configuration

The delivery workflow signs in to AWS through GitHub OIDC as the IAM role `GitHub-ContactMe`; no AWS access keys are stored in GitHub. The role and its permissions are described in [infra/github/README.md](infra/github/README.md).

Repository variables:

- `AWS_REGION`
- `CONTACT_EMAIL`
- `SENDER_EMAIL`
- `RECAPTCHA_SITE_KEY`

Repository secrets:

- `AWS_ACCOUNT_ID`: AWS account number, used to build the role ARN
- `RECAPTCHA_SECRET_KEY`: copied into prod's SST secret `RecaptchaSecretKey` on each prod deploy

## Local development, tests and deployment

Stages (`dev`, `int`, `prod`), commands, tests, delivery and rollback: [docs/development.md](docs/development.md).

```bash
npm install
npm run deploy -- --stage dev     # or: npm run dev -- --stage dev (sst dev)
npm run typecheck && npm test
```

## Notes

- The function URL is exposed through a CloudFront router on the API custom
   domain. CORS only allows the corresponding web custom domain (plus localhost off prod).
   On prod submissions are gated by reCAPTCHA and validated server side (length limits, email format,
   header-injection stripping).
- Emails are sent as plain text so that submitted content cannot inject HTML into
  the mailbox.
