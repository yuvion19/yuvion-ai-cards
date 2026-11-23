---
name: railway-release-safety
description: Check whether a GitHub change might trigger a Railway production rebuild or deployment for this repo, and prepare a non-destructive, evidence-based release decision before merging or pushing to main.
---

# Railway release-safety gate — Yuvion AI Cards

## Verified repo-specific context (2026-11-23)
- This repository is connected as source to multiple services in the Railway project **Yuvion AI Cards**.
- The production **marketplace** service reports Dockerfile builds and `watchPatterns: ["**/*"]` through Railway read-only service inspection.
- Three additional Railway services also report this repository as their build source. One more service uses an external container image.
- Some service deployment records may report failed or absent recent deployments; never infer that a fresh push will be harmless from past errors.
- GitHub Actions includes `CI smoke` and `Smoke test` on pushes to `main`, and a lockfile maintenance workflow with write permission. Other workflows have schedules or path-specific triggers.
- A documentation-only PR can therefore still have build/deployment effects. Do not assume unchanged application code means no production risk.

## Required pre-merge inspection
1. Retrieve current PR HEAD, base, files changed, test status and mergeability. Compare against the current `main` HEAD to prevent stale approvals.
2. Read the currently effective GitHub Actions YAML and inspect any `push`, `workflow_dispatch`, `schedule`, or `paths` filters.
3. Read Railway **service source, deployment configuration and watch patterns** for each source-linked service using authorized, read-only tools. Do not expose environment variable values.
4. Ask whether external hosting integrations, GitHub Apps, or webhooks might also build on main; if their configuration cannot be inspected, mark as *unknown*, not *safe*.
5. Distinguish pull-request checks (usually no release) from `main` pushes (may start builds). Consider branch-preview deployments separately.
6. For instruction-only changes, keep a draft PR or dedicated branch when main-push side effects cannot be ruled out.
7. If production deployment is clearly authorized, plan a quiet release window, backups/checkpoint and post-deployment health checks. Do not modify Railway settings or disable auto-deploy to work around risk.
8. Do not merge, deploy, restart, or alter production settings from a routine audit. A successful static/CI check proves neither deployment safety nor runtime health.

## Result format
- PR and exact HEAD; changed files and check conclusions.
- GitHub Actions triggers; Railway service-by-service source/build watch pattern.
- Known effects; unknown hooks; rollback options and post-merge verification.
- Decision: **safe to stage**, **approval needed for release**, or **blocked pending infrastructure evidence**.

## Project data boundary
This skill is about the repository `yuvion19/yuvion-ai-cards`, not the independently managed PUSK website, radio service, or other personal/workspace apps.
