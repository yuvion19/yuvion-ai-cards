---
name: uvmall-catalog-qa
description: Validate UVMALL/Ozon product-card assets, SEO fields and spreadsheet-import pricing/mapping changes. Use for product-card batches, importer QA, media validation and product moderation preparation; do not use for unrelated site work.
---

# UVMALL catalog and product card QA

## Product media acceptance
- The seller's standard marketplace output is **exactly 4 final images per product**, portrait **3:4, 900 × 1200 px**.
- Keep the supplied product fully visible and centered: do not crop away parts of the original item.
- Clean background, readable and consistent graphic hierarchy, and no watermarks.
- For home textiles (bedding/towels), never display price on any card.
- Build a ZIP with only the 4 final images. Put selling title and SEO description in the delivery message, not inside the ZIP.
- Check that 4 images are distinct, use a clean hero view, explanatory infographic angles and at least one useful context/alternate view; do not invent specifications.
- AI-generated visual additions must not be represented as authentic supplier photography.

## Catalog/import acceptance
- Never mutate the source Excel workbook; work on a copy. Keep a backup and a row-level error log.
- Map columns explicitly or via verified detection. The website generates slug: missing Excel Slug must not block import.
- Take brand from Excel Brand when present; do not silently overwrite it.
- Use ordinary item specifications only when supported by source evidence; never write descriptions to arbitrary/custom-characteristics fields.
- Media must come from verified Excel paths, linked files or a matched local photo folder. Validate each match before import.
- For the user's configured tier defaults: quantity 1–5 = wholesale base +30%; 6–10 = base +15%; 11+ = base; allow overrides per seller. If medium tier data is absent under the importer configuration, use the explicitly documented fallback (retail tier price), not a fabricated tier.
- Confirm that category, photo, price, brand, description and moderation flag are populated in the intended real fields for a one-product smoke test before a larger batch.
- Batch size can be 50, with test-one-product and submit-batch-to-moderation actions only after validation; do not publish or submit live inventory as part of a routine check.
- SEO descriptions for the AI generation workflow target at least 1000 Russian characters unless the project's current documented requirements override it.

## Quality gate
1. Identify source spreadsheet and image assets; verify file count and checksums.
2. Check image dimensions, nonempty content and readability. Flag uncertain matches and unsupported claims.
3. Run nonmutating formula/unit tests for price tiers, editable boundaries, optional fields and brand fallback.
4. Validate the normalized data output and simulated API payload without contacting production for write operations.
5. Where access is available, perform an explicitly authorized, reversible single-item smoke test; preserve source data.
6. Document test evidence, failures, unresolved inputs and exact changes. No production deployment or moderation without required confirmation.

## Do not infer deployment
A SKILL.md is task guidance; it is not an image generator, catalog importer, backend integration, installed MCP, or confirmed production feature.
