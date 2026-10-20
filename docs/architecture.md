# Architecture

Prism is a Manifest V3 extension written in JavaScript, HTML, and CSS. The files in `extension/` run directly in Chrome; packaging only creates a ZIP.

## Modules

| File                         | Responsibility                                                                            |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| `core.js`                    | Presets, settings validation, theme variables, contrast checks, and framing calculations. |
| `palette.js`                 | Local image sampling and palette generation in Oklab.                                     |
| `images.js`                  | File validation, public URL imports, metadata extraction, and media analysis.             |
| `media.js`                   | Image/video layers, rotation, soft backdrops, playback, and Blob URL cleanup.             |
| `storage.js`                 | Settings and media persistence, migrations, and change notifications.                     |
| `content.js` / `content.css` | Theme application inside Notion and restoration when disabled.                            |
| `studio.js` / `popup.js`     | Full controls and quick theme selection.                                                  |

## Settings and media

Settings and the selected background use separate `chrome.storage.local` keys, `prismSettings` and `prismImage`. Slider changes therefore do not rewrite the media payload. Imports retain the original bytes; palette samples and video thumbnails are separate from the displayed source.

The standalone Studio preview uses IndexedDB. It does not share settings with the extension.

Open views receive storage notifications. Studio tracks revisions per setting so an import that finishes late cannot overwrite a more recent theme or accent choice.

## Rendering

Core validates settings before producing CSS variables. The content script applies those variables and adds temporary style markers to recognized Notion elements. It does not rewrite saved page content or native inline styles. Mutation handling is batched across frames, and disabling Prism removes its styles, markers, and media layers.

Database containers stay transparent. Cards have a light theme tint; text uses a narrow contrasting edge, and status chips have paired foreground/background colors. Menus and reading panels use stronger surfaces. This improves readability without hiding the wallpaper, but it does not guarantee contrast over every pixel of an arbitrary image.

Media renders from local Blob URLs. Contain, cover, and stretch are display modes, not conversions of the stored file. The optional soft backdrop shares the source Blob; video playback is synchronized between the two layers. Cleanup pauses players and revokes URLs.

## Imports

Remote imports accept public HTTPS sources and request access to the relevant hosts. Redirect destinations pass the same validation and permission checks. Requests omit credentials, downloaded scripts are never executed, and failed imports leave the previous background in place.

Pinterest extraction ranks media belonging to the requested pin before related content. For supported single-file HLS video, the importer selects the highest declared resolution and stores the original fragmented MP4. Live, encrypted, and multi-file playlists are unsupported.

Provider metadata and Notion's DOM are external compatibility boundaries. They can change independently of Prism.
