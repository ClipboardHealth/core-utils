# @clipboard-health/clearance

HTTP/HTTPS clearance for deny-by-default sandboxes.

The proxy ships with **zero compiled-in opinions** about which hosts to allow.
Bring your own list — either inline via env or by pointing at one or more
plain-text files. Teams typically check those files into their repo so
everyone shares the same baseline.

## Install

```bash
npm install -g @clipboard-health/clearance
```

This installs two binaries: `clearance` (the proxy) and `clearance-ensure`
(idempotent daemon launcher).

## Raw proxy usage

```bash
CLEARANCE_ALLOW_HOSTS=api.example.com clearance
```

Then point tools at `http://127.0.0.1:19999` with `HTTP_PROXY` and
`HTTPS_PROXY`.

By default the proxy listens on `127.0.0.1:19999`, allows destination port
`443`, and blocks private, loopback, link-local, multicast, documentation,
and other non-public IP ranges after DNS resolution.

If neither `CLEARANCE_ALLOW_HOSTS` nor `CLEARANCE_ALLOW_HOSTS_FILES` is
set, the proxy refuses to start.

### Allow-host files

A file is a plain-text list of hosts, one per line. Blank lines are ignored,
`#` introduces a comment to end-of-line, and trailing dots / wildcard
prefixes (`*.example.com`) are normalized.

```text
# AI agents
api.openai.com
api.anthropic.com

# Source code
github.com
api.github.com
*.githubusercontent.com
```

Point at one or more files via `CLEARANCE_ALLOW_HOSTS_FILES` using your
platform's PATH delimiter — `:` on macOS/Linux, `;` on Windows. The values
from `CLEARANCE_ALLOW_HOSTS`, all referenced files, and any duplicates
are concatenated and deduped.

```bash
CLEARANCE_ALLOW_HOSTS_FILES="$REPO/clearance-allow-hosts:$HOME/.config/clearance/personal-hosts" \
  clearance
```

This is how teams share a baseline: check a `team-allow-hosts` file into
your repo, and let individuals layer a personal file on top via the same
env var.

### Configuration reference

<!-- markdownlint-disable MD060 -->

| Variable                      | Default     | Notes                                                                                                     |
| ----------------------------- | ----------- | --------------------------------------------------------------------------------------------------------- |
| `CLEARANCE_ALLOW_HOSTS`       | _(unset)_   | Comma- or whitespace-separated exact hosts and wildcard suffixes.                                         |
| `CLEARANCE_ALLOW_HOSTS_FILES` | _(unset)_   | PATH-delimited paths (`:` macOS/Linux, `;` Windows) to plain-text host files (`#` comments, blank lines). |
| `CLEARANCE_ALLOW_PORTS`       | `443`       | Comma- or whitespace-separated TCP ports.                                                                 |
| `CLEARANCE_LISTEN_HOST`       | `127.0.0.1` | Bind host.                                                                                                |
| `CLEARANCE_PORT`              | `19999`     | Bind port.                                                                                                |
| `CLEARANCE_DNS_TTL_MS`        | `60000`     | In-process DNS cache TTL.                                                                                 |
| `CLEARANCE_IDLE_TIMEOUT_MS`   | `120000`    | Socket idle timeout.                                                                                      |
| `CLEARANCE_MAX_SOCKETS`       | `1024`      | Inbound connection cap and outbound HTTP agent cap.                                                       |
| `CLEARANCE_ALLOW_PRIVATE_IPS` | _(unset)_   | Set to `1` to disable private/non-public IP blocking for local testing.                                   |

<!-- markdownlint-enable MD060 -->

## Managed proxy: `clearance-ensure`

`clearance-ensure` checks `127.0.0.1:19999`; if no proxy is listening it
spawns one detached using the same env vars and waits for it to bind. Logs
live at `${XDG_CACHE_HOME:-$HOME/.cache}/clearance/clearance.log`,
pid at `…/clearance.pid`.

```bash
CLEARANCE_ALLOW_HOSTS_FILES="$REPO/clearance-allow-hosts" clearance-ensure
```

To stop or restart the managed proxy after editing your allow-host files:

```bash
kill "$(cat "${XDG_CACHE_HOME:-$HOME/.cache}/clearance/clearance.pid")"
```

## Safehouse integration (macOS)

Safehouse uses macOS sandbox profiles, so this section is for macOS hosts
only. Safehouse allows network access by default for agent compatibility.
To force a wrapped agent through this proxy, run the proxy outside
Safehouse, then append a Safehouse profile that denies direct remote
egress while leaving `localhost` open for `http://127.0.0.1:19999`.

The package ships a `safehouse-clearance` wrapper plus the matching
`clearance.env` and `clearance-only.sb` profile. After a global install,
the wrapper lives at `$(npm root -g)/@clipboard-health/clearance/safehouse/safehouse-clearance`.
It ensures the proxy is running, then `exec`s safehouse with the env file and
sandbox profile alongside it. It does **not** parse or rewrite your
arguments — anything you pass is forwarded verbatim, so put any safehouse
flags before the agent command:

```bash
SAFEHOUSE_CLEARANCE="$(npm root -g)/@clipboard-health/clearance/safehouse/safehouse-clearance"

"$SAFEHOUSE_CLEARANCE" \
  --enable=cloud-credentials --env-pass=AWS_PROFILE,AWS_REGION \
  -- codex --dangerously-bypass-approvals-and-sandbox
```

For day-to-day agent use, set `CLEARANCE_ALLOW_HOSTS_FILES` to point at
your team's checked-in file (and optionally a personal file), then add
shell aliases:

```bash
SAFEHOUSE_CLEARANCE="$(npm root -g)/@clipboard-health/clearance/safehouse/safehouse-clearance"
export CLEARANCE_ALLOW_HOSTS_FILES="$HOME/code/<your-repo>/clearance-allow-hosts:$HOME/.config/clearance/personal-allow-hosts"

alias codex-proxy="$SAFEHOUSE_CLEARANCE codex --dangerously-bypass-approvals-and-sandbox"
alias claude-proxy="$SAFEHOUSE_CLEARANCE claude --enable-auto-mode"
```

For AWS SSO work, log in on the host first, then layer the safehouse cloud
credentials flag through the wrapper:

```bash
aws sso login --profile <profile>
AWS_PROFILE=<profile> "$SAFEHOUSE_CLEARANCE" \
  --enable=cloud-credentials --env-pass=AWS_PROFILE,AWS_REGION,AWS_SDK_LOAD_CONFIG,AWS_CONFIG_FILE,AWS_SHARED_CREDENTIALS_FILE,AWS_CA_BUNDLE \
  -- codex --dangerously-bypass-approvals-and-sandbox
```

Make sure your allow-host file includes the AWS endpoints you need
(typically `*.amazonaws.com`, `*.api.aws`, `*.awsapps.com`, `*.ecr.aws`).

### Manual setup

If you'd rather not depend on the bundled assets, you can build the same
setup by hand.

```bash
mkdir -p ~/.config/agent-safehouse
```

```bash
cat > ~/.config/agent-safehouse/clearance-only.sb <<'SB'
;; Force remote network egress through the local clearance while keeping
;; localhost available for local-only agent workflows.
(deny network-outbound
  (remote ip "*:*")
  (remote tcp "*:*")
  (remote udp "*:*"))

(allow network-outbound
  (remote ip "localhost:*")
  (remote tcp "localhost:*")
  (remote udp "localhost:*"))
SB
```

```bash
cat > ~/.config/agent-safehouse/clearance.env <<'ENV'
HTTP_PROXY="http://127.0.0.1:19999"
HTTPS_PROXY="http://127.0.0.1:19999"
ALL_PROXY="http://127.0.0.1:19999"
NO_PROXY="localhost,127.0.0.1,::1"

http_proxy="${HTTP_PROXY}"
https_proxy="${HTTPS_PROXY}"
all_proxy="${ALL_PROXY}"
no_proxy="${NO_PROXY}"
ENV
```

Then run the wrapped command with Safehouse:

```bash
safehouse \
  --env="$HOME/.config/agent-safehouse/clearance.env" \
  --append-profile="$HOME/.config/agent-safehouse/clearance-only.sb" \
  -- <agent-command>
```

Do not pass API-key environment variables just for proxying. The env file
only supplies proxy settings; agents should continue to use their normal
auth/config stores.

Quick checks:

```bash
# Should use the proxy and usually return 401 without auth.
safehouse --env="$HOME/.config/agent-safehouse/clearance.env" \
  --append-profile="$HOME/.config/agent-safehouse/clearance-only.sb" \
  -- curl -I https://api.openai.com/v1/models

# Should fail because this bypasses the proxy and tries direct egress.
safehouse --env="$HOME/.config/agent-safehouse/clearance.env" \
  --append-profile="$HOME/.config/agent-safehouse/clearance-only.sb" \
  -- curl --noproxy '*' -I https://api.openai.com/v1/models

# Should be denied by the proxy unless example.com is in your allow-host list.
safehouse --env="$HOME/.config/agent-safehouse/clearance.env" \
  --append-profile="$HOME/.config/agent-safehouse/clearance-only.sb" \
  -- curl -I https://example.com
```
