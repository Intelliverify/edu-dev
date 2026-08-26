# Git hooks (URID traceability)

Forward-only linkage check (PHASE0.7 §2). `commit-msg` warns when a commit
subject has no `[URID_PRODUCT_YEAR_NNNN]` reference (ideally paired with a
`[WI-...]` work-item tag), so new commits stay linked to a requirement's
timeline in the AdminPlatform pipeline.

## Enable (once per clone)

```
git config core.hooksPath .githooks
```

## Behaviour

- Non-blocking by default — it only warns.
- Set `URID_ENFORCE=1` in your environment to make it reject unlinked commits.
- `Merge`, `Revert`, `fixup!`, and `squash!` subjects are skipped.

Example subject: `[URID_EDU_2026_0042][WI-317] Add document OCR extractor`
