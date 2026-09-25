---
description: "Writing or editing GitHub Actions workflows: choosing runs-on runners, runner OS and egress constraints"
---

# CI Runners

- Default new or edited jobs to `runs-on: [self-hosted, cbh-amazon-linux-2023]` (2 vCPU / 8 GiB), subject to the exceptions below. Do not use `ubuntu-latest`, `ubuntu-latest-*-cores`, or the legacy alias `cbh-ci` for the same pool.
- Pick a size tier per job:
  - `[self-hosted, cbh-amazon-linux-2023]`: shell, API-only actions, deploys, notifications, Terraform init/output.
  - `[self-hosted, cbh-amazon-linux-2023-8-cores]` (8 vCPU / 32 GiB): `npm ci` followed by lint, typecheck, or test.
  - `[self-hosted, cbh-amazon-linux-2023-16-cores]` (16 vCPU / 64 GiB): Docker image builds and heavy integration or test suites.
  - `[self-hosted, cbh-terraform]`: Terraform plan/apply jobs that need the Terraform role.
- Write label arrays exactly as shown. Labels match exactly; adding `linux` or `x64` prevents scheduling.
- Hosts are reused, not ephemeral. Jobs that start containers or write outside the workspace must clean up in an `if: always()` step. Put temp files and CLI installs in `$RUNNER_TEMP`, adding CLI directories to `$GITHUB_PATH`, never in `/usr/local/bin` or `$HOME`.
- The OS is Amazon Linux 2023 (x86_64):
  - Install packages with `dnf`; `apt-get` does not exist.
  - Preinstalled: Docker with the `docker compose` plugin and buildx, git, jq, curl, AWS CLI, `gh`, Terraform, and Playwright's Chromium system libraries.
  - `actions/setup-node` works. `actions/setup-python` cannot provision versions; use system `python3.9`.
  - Use `npx playwright install chromium`, without `--with-deps`, which calls `apt-get`.
  - Pull `services:` images from `public.ecr.aws` (see `common/containerRegistry`).
- Runners can reach only allowlisted domains; other TLS/HTTP traffic is blocked. If a job needs a new host, say so in the PR and request the domain through a PR to `ClipboardHealth/cbh-infrastructure`, in `github-actions-runner/tools/main.tf` (`tools_vpc_additional_domain_allowlist`). Do not bypass the firewall with a GitHub-hosted runner.
- Keep GitHub-hosted runners only for these exceptions, each with a one-line comment explaining why:
  - macOS, Windows, arm64, or GPU jobs.
  - Actions without Amazon Linux support, such as `ruby/setup-ruby`.
- Public repositories use self-hosted runners only with Settings → Actions → "Require approval for all external contributors" enabled. Verify with `gh api repos/<owner>/<repo>/actions/permissions/fork-pr-contributor-approval`: it must report `approval_policy: all_external_contributors`. Otherwise use GitHub-hosted runners. `pull_request_target` runs fork PRs without that approval, so public-repository jobs on that trigger that check out or run PR code stay on GitHub-hosted runners.
- Rationale: self-hosted 8- and 16-core jobs ran about 50% faster in the open-shifts migration, and p90 queue wait dropped from 74s to 2s. Their egress firewall blocks data exfiltration from compromised actions or dependencies to non-allowlisted domains.
