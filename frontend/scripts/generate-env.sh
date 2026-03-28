#!/usr/bin/env bash
# Generate .env from .env.example allowlist using current environment.
# Only variables listed in .env.example are included — no platform internals leak.
grep '^[A-Z]' .env.example | cut -d= -f1 | while read -r var; do
  val="${!var}"
  [ -n "$val" ] && printf '%s=%s\n' "$var" "$val"
done > .env
