#!/usr/bin/env python3
"""Local static server for Rooftop Rumble. Binds to 127.0.0.1 only."""

import argparse
import os
import socket
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

HOST = "127.0.0.1"
DEFAULT_PORT = 8818


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def find_port(start):
    for port in range(start, start + 30):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                sock.bind((HOST, port))
            except OSError:
                continue
            return port
    raise SystemExit(f"No free port from {start} through {start + 29}.")


def main():
    parser = argparse.ArgumentParser(description="Serve Rooftop Rumble locally.")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()

    root = os.path.dirname(os.path.abspath(__file__))
    os.chdir(root)
    port = find_port(args.port)
    if port != args.port:
        print(f"Port {args.port} is busy, using {port} instead.", flush=True)

    server = ThreadingHTTPServer((HOST, port), Handler)
    url = f"http://{HOST}:{port}/"
    print(f"Rooftop Rumble at {url}", flush=True)
    if not args.no_browser:
        try:
            webbrowser.open(url)
        except Exception as exc:
            print(f"Could not open a browser ({exc}). Visit {url}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.", flush=True)
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
