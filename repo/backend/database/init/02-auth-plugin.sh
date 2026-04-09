#!/usr/bin/env sh
# ============================================================
# CampusOps - DB auth compatibility hook.
# Keep default MySQL authentication plugin and credentials
# created by the official entrypoint for deterministic startup.
# ============================================================
set -e

echo "[init-auth-plugin] Skipping auth-plugin mutation; retaining MySQL default auth plugin."
