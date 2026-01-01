# Export Diff Roadmap

This document outlines incremental improvements for exports and diffs.

## Current Behavior

- Project exports are versioned and stored in Export History.
- Diff compares:
  - Resolved tags and excluded tags
  - Resolved labels
  - Summary counts (images, annotations, splits)
  - Include/exclude match modes

This diff is useful for dataset-level changes but not per-image annotation changes.

## High-Value Improvements

1. Restore filter from export
2. Downloadable diff report (JSON/Markdown)
3. Added/removed image lists per export
4. Annotation fingerprinting to detect per-image changes
5. Milestone exports and tagging
6. Alerts for large deltas

## Notes

The goal is to treat exports as dataset versions and make the diff a guardrail
for training and evaluation, not a pixel-level audit tool.
