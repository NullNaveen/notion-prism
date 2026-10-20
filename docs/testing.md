# Testing

## Automated tests

```sh
npm ci
npm test
npm run format:check
npm run package
```

The tests use Node's built-in test runner. They cover settings normalization, palette contrast, import validation and redirects, media metadata, storage races, DOM adaptation, and extension lifecycle cleanup. Network and browser boundaries use test doubles, so the unit suite needs no Notion account or live Pinterest access.

GitHub Actions runs the same commands and saves the extension ZIP as an artifact. `scripts/package.py` includes only runtime files and verifies the archive's CRC and root manifest.

## Browser checks

Load `extension/` unpacked in a separate Chrome profile, then use a test Notion workspace:

1. Switch between a dark and light preset. Check headings, editable text, muted labels, menus, side peeks, and status chips.
2. Check table, board, list, gallery, calendar, timeline, and feed views. Database backgrounds should remain transparent, including when reading-panel opacity is set to 100%.
3. Toggle document text matching. Authored text colors should return when it is off; code and artwork should remain unchanged.
4. Upload a still image, GIF, and video. Confirm animation, replacement, pause/resume, and persistence after reopening Studio.
5. Try all three framing modes in wide and tall windows. Rotate and revert. Verify that the source dimensions remain unchanged and that enlargement/distortion notices describe the selected mode.
6. Import a public image link and a public Pinterest pin. Test permission denial and an unavailable source; the existing background should survive either failure.
7. Edit text and switch pages or views without refreshing. New content should receive the current theme.
8. Turn Prism off and on. Reload the extension, then refresh Notion; check for duplicate media layers or console errors.

The HTML fixtures in `tests/fixtures/` reproduce useful Notion style patterns for controlled browser checks. The small media fixtures cover animation and decoding. Fixtures do not establish compatibility with every live workspace or future Notion layout.

Keep browser profiles, logs, screenshots of private pages, and downloaded source media out of Git. The ignored `output/` directory can hold local test artifacts.
