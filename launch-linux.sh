#!/usr/bin/env bash
cd "$(dirname "$0")" || exit 1
if command -v python3 >/dev/null 2>&1; then
  exec python3 server.py
fi
if command -v python >/dev/null 2>&1; then
  exec python server.py
fi
echo "Python 3 is required to launch Rooftop Rumble."
echo "Install it from https://www.python.org/downloads/ and try again."
exit 1
