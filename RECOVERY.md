# Niti Pamyati — Recovery Plan

Snapshot date: 2026-09-26

## Protected source snapshots

- `backup/nitipamyati-2026-09-26`
  - pinned from commit `09866e9ef85f39cdc934e23141d58202a127faa3`
- `backup/niti-memory-site-2026-09-26`
  - pinned from commit `6563b2766c67b746b6c9655cfe532c3071a39d59`

Do not use these branches for routine development. They are recovery points.

## Current hosting redundancy

### Render
- `https://nitipamyati.onrender.com`
- `https://niti-pamyati-museum.onrender.com`
- `https://niti-pamyati.onrender.com`

Render services use the same GitHub repository but two source branches:
- `nitipamyati`
- `niti-memory-site`

### Vercel
Project: `nitipamyati`
Latest known production deployment ID at snapshot time:
`dpl_Dh5tiup7f4V37ZX9E2WfsHiGajnf`

## Recovery procedure

1. Do not delete or rewrite the protected backup branches.
2. If the active branch breaks, point a new deployment at the appropriate protected backup branch.
3. If Render is unavailable, use the Vercel project as the alternate host.
4. If Vercel is unavailable, deploy the protected GitHub branch to Render or another static hosting provider.
5. Keep the domain independent from the hosting provider. DNS should be able to move between hosts without changing the repository.
6. Keep databases, uploaded media, and secrets outside the frontend repository and back them up separately.
7. Never commit API keys, passwords, or private credentials to GitHub.

## Remaining infrastructure work

- Attach a user-owned custom domain.
- Add DNS-level failover or a documented manual switch.
- Back up any database and uploaded files independently.
- Keep an offline/exported copy of the repository in addition to GitHub.
