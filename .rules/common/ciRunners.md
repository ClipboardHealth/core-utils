---
description: "Writing or editing GitHub Actions workflows: choosing runs-on runners, runner OS and egress constraints"
---

# CI Runners

- Use `runs-on: [self-hosted, cbh-amazon-linux-2023]` for new or edited jobs, with the exceptions below. Do not use `ubuntu-latest`, `ubuntu-latest-*-cores`, and `cbh-ci` (the old name for the same pool).
- Pick a size for each job:
  - `[self-hosted, cbh-amazon-linux-2023]` (2 vCPU / 8 GiB): shell, API-only actions, deploys, notifications, Terraform init/output.
  - `[self-hosted, cbh-amazon-linux-2023-8-cores]` (8 vCPU / 32 GiB): `npm ci` then lint, typecheck, or test.
  - `[self-hosted, cbh-amazon-linux-2023-16-cores]` (16 vCPU / 64 GiB): Docker builds and heavy integration or test suites.
  - `[self-hosted, cbh-terraform]`: Terraform plan/apply needing the Terraform role.
- Use these exact label arrays. Adding `linux` or `x64` stops jobs from being scheduled.
- Hosts are reused. Clean up containers and writes outside the workspace in an `if: always()` step. Use `$RUNNER_TEMP` for temp files and CLI installs; add CLI directories to `$GITHUB_PATH`. Do not use `/usr/local/bin` or `$HOME`.
- Runners use Amazon Linux 2023 (x86_64):
  - Use `dnf`; there is no `apt-get`.
  - Installed: Docker, `docker compose`, buildx, git, jq, curl, AWS CLI, `gh`, Terraform, and Playwright's Chromium system libraries.
  - `actions/setup-node` works. `actions/setup-python` cannot install versions; use system `python3.9`.
  - Use `npx playwright install chromium`. Do not add `--with-deps`: it calls `apt-get`.
  - Use `public.ecr.aws` for `services:` images (see `common/containerRegistry`).
- The firewall allows only listed domains; other TLS/HTTP traffic is blocked. For a new host, mention it in the PR and open a PR to `ClipboardHealth/cbh-infrastructure`: add it to `tools_vpc_additional_domain_allowlist` in `github-actions-runner/tools/main.tf`. Do not switch to GitHub-hosted runners to bypass the firewall.
- Apart from the public-repo policy below, use GitHub-hosted runners only for macOS, Windows, arm64, GPU, or actions without Amazon Linux support (such as `ruby/setup-ruby`). Add a one-line comment explaining why.
- Public repos need Settings → Actions → "Require approval for all external contributors" before using self-hosted runners. Check `gh api repos/<owner>/<repo>/actions/permissions/fork-pr-contributor-approval` for `approval_policy: all_external_contributors`. Otherwise, use GitHub-hosted runners. `pull_request_target` bypasses fork approval: public jobs using this trigger to check out or run PR code must stay GitHub-hosted.
- Why: 8- and 16-core jobs ran about 50% faster in open-shifts; p90 queue wait fell from 74s to 2s. The firewall blocks compromised actions or dependencies from sending data to non-allowlisted domains.
