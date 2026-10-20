# Chrome Web Store publishing

Build the extension with `npm run package` before submitting it to the Chrome Web Store. This repository does not include a published store listing.

## Submission files

- `dist/prism-for-notion-1.4.0.zip`: upload this ZIP as the extension package.
- `store/LISTING.md`: copy for the description, single purpose, permissions, and reviewer instructions.
- `store/screenshot-aurora-1280x800.png` and `store/screenshot-sakura-1280x800.png`: screenshots of the actual Theme Studio, which contains an explicitly labeled illustrative Notion preview.
- `store/promo-440x280.png`: small promotional tile.
- `extension/icons/icon128.png`: 128 × 128 icon, also already included in the ZIP.
- `extension/privacy.html`: privacy policy covering this build. Publish a copy at a stable public HTTPS URL and use that URL in the listing.

## Submission steps

1. Open the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) with the Google account that should own this extension. Register as a developer, review the publisher terms, pay Google's one-time registration fee shown there, and complete the account/contact/verification requirements. See [Google's registration guide](https://developer.chrome.com/docs/webstore/register).
2. Test the extension in your everyday Notion workspace before public release, including databases, menus, dark/light themes, and an image background. The automated tests and representative browser fixtures do not cover every signed-in workspace.
3. Click **Add new item**, choose the ZIP, and upload it. This is an **extension**, even though its purpose is theming a website; it is not a Chrome browser theme.
4. Fill out the name, description, language, category, screenshots and promotional tile. Add your developer identity and support contact. Check name availability and the final listing for any claims you want to change. The description already states it is independent of Notion.
5. Host the included privacy policy under a URL you control. Check that it describes your final code and add your publisher contact details if desired. Put that URL in the Privacy practices tab. A local file path cannot serve as the store's public privacy-policy URL.
6. Enter the single-purpose statement and permission justifications from `store/LISTING.md`. Select that the extension does **not** execute remote code. Complete the data-use disclosures accurately: this build uses local preferences and user-selected images, inspects Notion's page structure/styles locally, and requests remote image/page data only after the user initiates an import. It has no developer server, telemetry, advertising, or data sale. Do not blindly claim “no data is handled”; review the form's definitions and [Google's privacy guidance](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy).
7. Add the testing instructions from the listing file. Choose your audience and regions in Distribution. Start with trusted testers or unlisted distribution if you want feedback before a public launch; use Public when ready for anyone to find it.
8. Choose **Submit for review**. You can choose manual publishing after approval. Google decides approval and review time; an upload-ready ZIP does not guarantee acceptance. See the [official publishing flow](https://developer.chrome.com/docs/webstore/publish).
9. After publication, share the Chrome Web Store listing URL. Other people can install normally without Developer mode. Compatible Chromium browsers can also use the store where their browser permits it; an Edge Add-ons listing is a separate publication.

## Image requirements

The prepared screenshots are 1280 × 800, the promo tile is 440 × 280, and the icon is 128 × 128. Check the current store requirements before uploading new artwork. See [the official image requirements](https://developer.chrome.com/docs/webstore/images). Use your own or licensed imagery if you later replace the listing art; uploaded personal backgrounds are not bundled or shared with other users.

## Future updates

Change `extension/manifest.json` and `package.json` to a higher version, run the tests, retest Notion, then run `python3 scripts/package.py`. Upload the new ZIP to the same store item. Keep the store description and privacy policy consistent with new functionality or data use. Users who installed through the store receive published updates through the browser.

## Other stores

The code is designed around Chromium APIs, so the same runtime is a starting point for Edge Add-ons. Firefox needs a compatibility/signing pass and Mozilla publication. Safari needs platform packaging/testing and Apple distribution. These separate releases are not included or claimed tested in this version.
