#!/usr/bin/env python3
"""Smoke test: server.py serves index.html on 127.0.0.1."""

import os
import pathlib
import socket
import subprocess
import sys
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]


def free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def main():
    port = free_port()
    proc = subprocess.Popen(
        [sys.executable, str(ROOT / "server.py"), "--port", str(port), "--no-browser"],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    try:
        url = f"http://127.0.0.1:{port}/index.html"
        body = None
        status = None
        for _ in range(50):
            if proc.poll() is not None:
                output = proc.stdout.read() if proc.stdout else ""
                raise SystemExit(f"server exited early:\n{output}")
            try:
                with urllib.request.urlopen(url, timeout=1) as response:
                    status = response.status
                    body = response.read().decode("utf-8", "replace")
                break
            except Exception:
                time.sleep(0.1)
        if body is None:
            output = ""
            if proc.stdout:
                proc.terminate()
                output = proc.stdout.read()
            raise SystemExit(f"server did not respond on {url}\n{output}")
        if status != 200:
            raise SystemExit(f"expected 200, got {status}")
        if "Rooftop Rumble" not in body or "<canvas" not in body:
            raise SystemExit("index.html missing title or canvas")
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/arcade.json", timeout=2) as response:
            arcade = response.read().decode("utf-8")
        if '"rooftoprumble"' not in arcade:
            raise SystemExit("arcade.json was not served")
        print(f"server smoke ok {status} port {port}")
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            proc.kill()


if __name__ == "__main__":
    main()
