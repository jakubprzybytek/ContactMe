# AWS IAM Role for GitHub Actions Deploy Workflow

The deploy workflow (`.github/workflows/deploy.yml`) authenticates to AWS using OpenID Connect (OIDC)
and assumes an IAM role. This document describes the required trust policy and permission policy for
that role.

## Trust Policy

The trust policy allows the GitHub Actions OIDC provider to assume the role, scoped to the `main`
branch of the `jakubprzybytek/ContactMe` repository. GitHub's immutable subject uses the numeric
owner and repository IDs so renaming either does not break or broaden the trust relationship.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "repo:jakubprzybytek@90648/ContactMe@1319241785:ref:refs/heads/main"
        }
      }
    }
  ]
}
```

> **Prerequisites:** An OIDC identity provider for `token.actions.githubusercontent.com` must be
> registered in your AWS account before this trust policy takes effect. See the
> [GitHub OIDC documentation](https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services)
> for setup instructions.

## Permission Policy

SST Ion (v4) uses Pulumi to manage infrastructure. The role must have permissions to create and
manage all resources that the application uses:

| Service | Resources |
|---------|-----------|
| **S3** | SST bootstrap bucket, static-site bucket |
| **CloudFront** | Distribution, Origin Access Control |
| **Lambda** | Function (`ContactApi`), function URLs |
| **IAM** | Execution roles and inline policies for Lambda |
| **SSM Parameter Store** | SST secrets and SST state parameters |
| **SES** | Send-email permission for the Lambda execution role |
| **STS** | `GetCallerIdentity` (used by SST/Pulumi at bootstrap) |

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "S3DeployBuckets",
      "Effect": "Allow",
      "Action": [
        "s3:CreateBucket",
        "s3:DeleteBucket",
        "s3:GetBucketPolicy",
        "s3:PutBucketPolicy",
        "s3:DeleteBucketPolicy",
        "s3:GetBucketVersioning",
        "s3:PutBucketVersioning",
        "s3:GetBucketPublicAccessBlock",
        "s3:PutBucketPublicAccessBlock",
        "s3:GetEncryptionConfiguration",
        "s3:PutEncryptionConfiguration",
        "s3:GetBucketTagging",
        "s3:PutBucketTagging",
        "s3:GetBucketWebsite",
        "s3:PutBucketWebsite",
        "s3:DeleteBucketWebsite",
        "s3:GetBucketCORS",
        "s3:PutBucketCORS",
        "s3:GetBucketOwnershipControls",
        "s3:PutBucketOwnershipControls",
        "s3:ListBucket",
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:GetObjectTagging",
        "s3:PutObjectTagging"
      ],
      "Resource": "*"
    },
    {
      "Sid": "CloudFront",
      "Effect": "Allow",
      "Action": [
        "cloudfront:CreateDistribution",
        "cloudfront:DeleteDistribution",
        "cloudfront:GetDistribution",
        "cloudfront:UpdateDistribution",
        "cloudfront:TagResource",
        "cloudfront:UntagResource",
        "cloudfront:ListTagsForResource",
        "cloudfront:CreateInvalidation",
        "cloudfront:CreateOriginAccessControl",
        "cloudfront:DeleteOriginAccessControl",
        "cloudfront:GetOriginAccessControl",
        "cloudfront:UpdateOriginAccessControl"
      ],
      "Resource": "*"
    },
    {
      "Sid": "Lambda",
      "Effect": "Allow",
      "Action": [
        "lambda:CreateFunction",
        "lambda:DeleteFunction",
        "lambda:GetFunction",
        "lambda:GetFunctionConfiguration",
        "lambda:UpdateFunctionCode",
        "lambda:UpdateFunctionConfiguration",
        "lambda:AddPermission",
        "lambda:RemovePermission",
        "lambda:GetPolicy",
        "lambda:ListVersionsByFunction",
        "lambda:PublishVersion",
        "lambda:CreateFunctionUrlConfig",
        "lambda:DeleteFunctionUrlConfig",
        "lambda:GetFunctionUrlConfig",
        "lambda:UpdateFunctionUrlConfig",
        "lambda:TagResource",
        "lambda:UntagResource",
        "lambda:ListTags"
      ],
      "Resource": "*"
    },
    {
      "Sid": "IAMRolesForLambda",
      "Effect": "Allow",
      "Action": [
        "iam:CreateRole",
        "iam:DeleteRole",
        "iam:GetRole",
        "iam:PassRole",
        "iam:AttachRolePolicy",
        "iam:DetachRolePolicy",
        "iam:PutRolePolicy",
        "iam:DeleteRolePolicy",
        "iam:GetRolePolicy",
        "iam:ListAttachedRolePolicies",
        "iam:ListRolePolicies",
        "iam:TagRole",
        "iam:UntagRole"
      ],
      "Resource": "arn:aws:iam::<ACCOUNT_ID>:role/contact-me-*"
    },
    {
      "Sid": "SSMSecretsAndState",
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameter",
        "ssm:GetParameters",
        "ssm:GetParametersByPath",
        "ssm:PutParameter",
        "ssm:DeleteParameter",
        "ssm:DeleteParameters",
        "ssm:AddTagsToResource",
        "ssm:ListTagsForResource"
      ],
      "Resource": "arn:aws:ssm:*:<ACCOUNT_ID>:parameter/sst/*"
    },
    {
      "Sid": "STS",
      "Effect": "Allow",
      "Action": [
        "sts:GetCallerIdentity"
      ],
      "Resource": "*"
    }
  ]
}
```

Replace `<ACCOUNT_ID>` with your AWS account ID.

## GitHub Repository Secrets and Variables

After creating the IAM role, configure the following in the GitHub repository settings:

| Name | Type | Description |
|------|------|-------------|
| `AWS_ROLE_ARN` | Variable | ARN of the IAM role created above, e.g. `arn:aws:iam::<ACCOUNT_ID>:role/github-actions-contact-me` |
| `CONTACT_EMAIL` | Variable | Destination mailbox for contact form submissions |
| `SENDER_EMAIL` | Variable | SES-verified "From" address |
| `RECAPTCHA_SECRET_KEY` | Secret | Google reCAPTCHA v3 server-side secret key |
| `RECAPTCHA_SITE_KEY` | Variable | Google reCAPTCHA v3 client-side site key |
| `AWS_REGION` | Variable | AWS region to deploy to (defaults to `eu-central-1`) |
