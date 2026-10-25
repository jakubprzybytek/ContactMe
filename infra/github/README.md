# GitHub Actions deploy role

This repo deploys to AWS following the [aws-github-deploy standard](https://github.com/jakubprzybytek/agent-playbook/blob/main/skills/aws-github-deploy/STANDARD.md).

| | |
|---|---|
| Role | `GitHub-ContactMe` |
| Policies | `SST-Deployment` (shared), `ContactMe-Deployment` (this repo, [deploy-policy.json](deploy-policy.json)) |
| SST app name / resource prefix | `contact-me` |
| Region | `eu-west-1` (shared certificate in `us-east-1` for CloudFront) |
| Workflows that deploy | `.github/workflows/deploy.yml` (stage `int` = contactme.albedoonline.com) |
| GitHub | secret `AWS_ACCOUNT_ID`, variable `AWS_REGION` |

`deploy-policy.json` has `ACCOUNT_ID` in place of the account number. The rendered policy and the trust policy are in `private/` (gitignored).

## What the project policy covers

The app is a Lambda function with a function URL behind a CloudFront router (`api.contactme.albedoonline.com`) and a static site on CloudFront, sharing one ACM certificate. The reCAPTCHA secret is an SST secret (SSM).

- `Identity`: `sts:GetCallerIdentity`.
- `SstState`: SST parameters under `/sst/*`, including the `RecaptchaSecretKey` secret the workflow sets.
- `Buckets`: S3 on the site bucket (`contact-me-*`) and the SST asset bucket (`sst-asset-*`, Lambda code uploads).
- `Functions`: Lambda functions `contact-me-*`, including the function URL.
- `Logs`: CloudWatch log groups in eu-west-1.
- `Edge`: CloudFront (distributions, functions, cache policy, KeyValueStore), ACM certificate and Route 53 records. Account-wide; these services can't be scoped usefully.
- `Roles`: IAM roles `contact-me-*` for the function. The function's own `ses:SendEmail` permission is an inline policy on that role; the deploy role needs no SES access.
- `PassFunctionRoles`: pass `contact-me-*` roles to Lambda only.

## Deviations from the standard

- None.

## Changing the role or policy

From the repo root, with admin credentials (`aws login`):

```sh
~/.claude/skills/aws-github-deploy/scripts/setup-role.sh ContactMe
```

The script is safe to re-run: it renders the documents, publishes a new policy version if the file changed, updates the trust policy and tags, and sets the GitHub secret and variable.
