#!/usr/bin/env bash
# Secret scan over staged changes — blocks obvious credential leaks.
# Installed locally at .git/hooks/pre-commit; safe to run standalone:
#   bash scripts/precommit-secret-scan.sh
set -u

pat='(sk_live_[A-Za-z0-9]{16,}|sk_test_[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16}|GOCSPX-[A-Za-z0-9_-]{10,}|ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[0-9A-Za-z-]{10,}|r8_[A-Za-z0-9]{40}|-----BEGIN [A-Z ]*PRIVATE KEY-----)'

if git diff --cached -U0 --diff-filter=ACM | grep -nE "^\+.*${pat}" >&2; then
  echo '' >&2
  echo 'pre-commit: possible secret in staged changes above.' >&2
  echo 'Unstage it and keep real keys in environment variables only.' >&2
  exit 1
fi
exit 0
