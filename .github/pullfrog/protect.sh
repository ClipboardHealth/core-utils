#!/usr/bin/env bash
set -euo pipefail

if [[ $# != 1 || $EUID != 0 || ! $1 =~ ^/tmp/pullfrog-review-[A-Za-z0-9]{6}$ ]]; then
  echo 'Usage: sudo bash protect.sh /tmp/pullfrog-review-XXXXXX' >&2
  exit 1
fi

root=$1
if [[ ! -d $root || -L $root || $(readlink -f -- "$root") != "$root" ]]; then
  echo 'Expected a real prepared review directory under /tmp.' >&2
  exit 1
fi
if [[ $(stat -c '%u:%a' /tmp) != 0:1777 ]]; then
  echo 'Policy protection requires root-owned sticky /tmp.' >&2
  exit 1
fi
if [[ -n $(find "$root" ! -type d ! -type f -print -quit) ]]; then
  echo 'Policy protection rejects symlinks and special files.' >&2
  exit 1
fi

# Public sacrificial fixture: failed setup must not truncate private policy text.
mkdir -- "$root/protection-probe"
printf 'probe\n' > "$root/protection-probe/file"
chown -R --no-dereference root:root -- "$root"
chmod -R a+rX,a-w -- "$root"
echo 'Sealed review policy files against unprivileged writes.'
