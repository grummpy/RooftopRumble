#!/bin/bash
cd "$(dirname "$0")" || exit 1
if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 is required to launch Rooftop Rumble."
  echo "Install it from https://www.python.org/downloads/ and try again."
  read -r -p "Press Enter to close..."
  exit 1
fi
exec python3 server.py
