---
name: uvmusic-catalog-qa
description: Check the UVMusic/RITM free music catalog, playback, attribution, source licensing, mobile UI and service-worker caching before modifying or publishing music features.
---

# UVMusic catalog and playback QA

## Actual repository surfaces
- App: `uvmusic/index.html` (includes catalog, search, cards, player, rights view, favorites and recent history).
- PWA metadata: `uvmusic/manifest.webmanifest`.
- Service worker: `uvmusic/sw.js`.
- Do not conflate this music catalog with the separate 24/7 radio project.

## Legal and source verification
1. Inventory actual recording URLs, source pages, performers, composers, license labels, and rights notices.
2. A composition's public-domain status does **not** establish that a particular recording is public domain.
3. Confirm the license or rights statement for **each recording** at its individual canonical source, including any jurisdiction, attribution or noncommercial restrictions.
4. If the source is inaccessible, classify the track as unverified rather than guessing. Do not add copyrighted recordings merely because they appear on a streaming site.
5. Never represent a track as CC0 unless its recording rights are supported by source evidence. A direct audio file link alone is not evidence.
6. Store proof and a date checked in a review manifest; do not hotlink to unstable audio sources without failover handling.

## Player and UX verification
- Test first play/pause, next/previous, shuffle/repeat, scrubbing, volume, media errors, retries and end-of-track behavior.
- Test search/filters with both matching and empty results and verify that the visible catalog count matches actual records.
- Test narrow mobile layouts, touch targets, VoiceOver labels, focus order and keyboard navigation.
- Verify favorites and recent history recover from corrupt or unavailable local storage without breaking playback.
- Ensure the PWA still opens without a network connection where an offline shell is advertised; do not claim audio is offline-ready unless content was explicitly cached.

## Service-worker precautions
- The current `sw.js` caches GET responses. Review cache growth, audio streaming and range requests, cross-origin failure and storage pressure before changing this policy.
- Do not automatically cache entire audio streams as part of a UI performance fix.
- Respect browser quota limits and do not delete user caches or local data merely to simplify tests.
- Validate version bump, update activation and network fallback with controlled fixtures.

## Release gate
1. Reproduce the issue and establish a baseline (including mobile network and slow-load behavior).
2. Make the smallest reversible change on a branch; keep the core design and free-access intent.
3. Run static checks and accessible local playback tests. Never start a paid service or use credentials without approval.
4. Ensure unrelated radio content and deployments are untouched.
5. Report exactly which URLs and recordings were tested, licensing evidence, runtime outcomes and unresolved failures.
6. Production publication is a separate verified action; a passing static test does not establish working third-party streams.
