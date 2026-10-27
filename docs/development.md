# Development

This app is developed and delivered per the [continuous-delivery standard](https://github.com/jakubprzybytek/agent-playbook/blob/main/skills/continuous-delivery/STANDARD.md): develop on `dev`, every push to `main` goes through `int` to `prod`. This file holds what is specific to this app.

## Stages

| Stage | Site | API | Notes |
|---|---|---|---|
| `dev` | https://dev.contactme.albedoonline.com | https://api.dev.contactme.albedoonline.com | messages logged, not emailed |
| `int` | https://int.contactme.albedoonline.com | https://api.int.contactme.albedoonline.com | the pipeline's tests; messages logged, not emailed |
| `prod` | https://contactme.albedoonline.com | https://api.contactme.albedoonline.com | live: reCAPTCHA checked, messages emailed with SES |

What differs per stage is decided in one place, `isProd` in `sst.config.ts`. Off prod the function runs with `DELIVERY=log`: no reCAPTCHA check, no email, no SES permission; it logs the submission's lengths and answers `{ ok: true, delivered: false }`. The page doesn't load reCAPTCHA there (no site key). So `dev` and `int` need no secrets or email settings.

prod needs, at deploy time, the GitHub variables `CONTACT_EMAIL`, `SENDER_EMAIL`, `RECAPTCHA_SITE_KEY` and the SST secret `RecaptchaSecretKey`, which the pipeline sets from the GitHub secret `RECAPTCHA_SECRET_KEY` before deploying.

## Run locally

```sh
npm run deploy -- --stage dev     # full deployment to dev
npm run dev -- --stage dev        # sst dev: the function on your machine, the site on http://localhost:5173
```

## Tests

| Kind | Command |
|---|---|
| Type check, unit | `npm run typecheck`, `npm test` |
| Integration (API) | `npx sst shell --stage dev -- npm run test:integration` |
| E2E | `npx sst shell --stage dev -- npm run test:e2e` |

The email path (reCAPTCHA verification, SES) is covered by unit tests with both mocked; it runs for real only on prod.

## Delivery

`.github/workflows/continuous-delivery.yaml`, per the standard. Releases: tags `vM.N`, one per release, only going forward, starting at `v0.1`; shown below the form. After the prod deploy the pipeline only checks that the site and the API answer (no submission: it would email a real inbox). Rollback: run Continuous Delivery manually from the release tag ("Use workflow from"; `gh workflow run continuous-delivery.yaml --ref vM.N`).

Ask before pushing changes that touch data, resources holding data, access, or cost (the standard, section 5). Here also: anything that changes who receives the emails, the sender identity, the reCAPTCHA check or the CORS origins on prod.

Dependencies: Dependabot per the [dependabot standard](https://github.com/jakubprzybytek/agent-playbook/blob/main/skills/dependabot/STANDARD.md); pull requests run `.github/workflows/pull-request-checks.yaml`.

## Deviations

- **No test user:** the app has no login.
- **The pipeline doesn't send a real message:** emailing and reCAPTCHA are off on `dev` and `int`, and nothing is submitted on prod. Unit tests cover that path with mocks.
- **An app secret comes from a GitHub secret:** `RECAPTCHA_SECRET_KEY` is copied into the SST secret of prod on every prod deploy. It's the app's own key, not a test password; it could instead be set once with `sst secret set --stage prod` and the GitHub secret deleted.
