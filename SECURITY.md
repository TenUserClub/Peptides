# Security policy

## Reporting a vulnerability

Please report suspected vulnerabilities privately through a [GitHub security advisory](https://github.com/TenUserClub/Peptides/security/advisories/new). Include the affected URL or file, reproduction steps, likely impact, and any suggested remediation. Do not place credentials, personal data, or exploit details in a public issue.

The public disclosure policy and safe-research expectations are published at https://safepeptides.us/security/.

## Supported code

Security fixes are applied to the current default branch and current production deployments. Older commits and withdrawn content are retained only for audit and are not separately supported.

## Secret incidents

If a credential is committed or logged, revoke or rotate it at the provider first, remove it from every active environment, review provider and GitHub audit logs, replace the repository reference with a secret, and then remove it from Git history where appropriate. Rewriting history does not revoke a credential.
