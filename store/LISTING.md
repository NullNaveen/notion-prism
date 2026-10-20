# Listing copy

## Name

Prism — Themes for Notion

## Short description

Coordinated colorful themes, vibrant gradients, and your own image backgrounds for the Notion web app.

## Detailed description

Choose a color theme or set your own background in Notion.

Prism includes eight light and dark palettes, including Aurora, Sakura, and Matcha. Your sidebar, reading surfaces, text, menus, borders, and accents follow the palette.

• Eight curated palettes with a quick-switch toolbar popup.
• A Theme Studio with an illustrative live workspace preview.
• Match text, panels, and accents to your image with automatic local color analysis.
• Choose a light or dark preset instead, and keep it when you replace the image.
• Upload a background from your device, or import a public HTTPS image URL.
• Import public Pinterest Pin pages and pin.it share links when the source allows downloads.
• Replace the current background with a new file or link in one place.
• Preserve original media bytes and animated GIF frames.
• Import supported Pinterest story videos at their highest published resolution.
• See an enlargement and cropping estimate before choosing Fit or Fill.
• Loop MP4/WebM videos silently with pause/resume.
• Automatically fit new portrait backgrounds to wide windows, with a crop notice and Revert.
• Rotate images and videos in 90° steps without changing the original file.
• Keep the complete image centered with an optional soft backdrop that fills unused space.
• Show the entire image, crop to fill, or stretch to the window, with dim, blur, and position controls.
• See your wallpaper through tables and boards, with translucent cards and protected text.
• Adjust reading-surface opacity and choose a custom accent, with text-contrast protection.
• Changes save locally and update your open Notion tabs.
• Pause Prism at any time to restore Notion's original appearance.

No Prism account, subscriptions, analytics, or cloud upload. Original media bytes are preserved and their colors analyzed on your device. Importing a web image contacts its host only after you grant access. Settings, images, and sampled palettes stay in your browser profile; Prism does not synchronize them between devices.

Works with the desktop Notion website on notion.so, app.notion.com, and notion.site. It does not change your Notion page contents, affect collaborators' themes, or theme Notion's native apps. Published pages on custom domains are not included. Choose whether document text follows the theme or keeps its authored colors. Code palettes and artwork remain intact. Notion layout updates may require an extension update.

Pinterest and some image hosts may block public downloads or require login. Redirecting links are followed after source access is granted. If a page cannot be imported, use the direct image address or upload a saved image. GIFs retain their animation; MP4 and WebM videos loop silently. Source files are limited to 20 MB and supported browser codecs. Show entire image and Fill keep the source proportions. Stretch fills both axes by changing those proportions.

Prism is an independent project, not affiliated with or endorsed by Notion, Google, or Pinterest.

## Single purpose

Customize the local visual appearance of the Notion web app with coordinated color themes and user-selected backgrounds.

## Permission justifications

**storage:** Save appearance preferences, one original background image or video, and its locally derived color palette in the user's browser profile, and update open Notion tabs when preferences change. No server storage or syncing is used.

**unlimitedStorage:** Keep original image and video files up to the 20 MB source limit without resizing, recompressing or stripping animation to meet Chrome's default 10 MB storage quota. Only one selected background is kept; this permission does not add network or website access.

**webRequest:** Read redirect destinations for the extension's own image-import requests because browser Fetch hides those headers. This allows Pinterest short links and redirecting image hosts to work while validating and permission-checking each destination before requesting it. The listener exists only during a download step, filters for the extension's own initiator and exact requested URL, and is removed afterward. It does not block or modify traffic, inspect response bodies through this API, or record unrelated browsing activity.

**Notion content-script site access:** Apply scoped CSS and inspect visible page structure/styles on notion.so, app.notion.com and notion.site to coordinate interface colors and backgrounds. No Notion text content, credentials, documents, or browsing history are stored or transmitted by Prism.

**Optional https://_/_ host access:** A user may import an image from any public HTTPS image host. The wildcard declares possible future hosts only. The extension requests the specific source host at runtime when the user submits an image URL. For public Pinterest URLs, it requests pin.it, Pinterest subdomains used for regional pages and short-link redirects, and pinimg.com image hosts. A different metadata image host or redirect destination requires another explicit grant. Requests omit credentials and do not execute downloaded scripts.

**Remote code:** No. All JavaScript is packaged with the extension. Remote responses are treated as bounded image bytes or inert HTML metadata, never executed.

## Reviewer instructions

1. Install and pin Prism. Click the icon and open Theme Studio. No Prism account is required.
2. Select Aurora, then Sakura. The illustrative preview updates, and selections persist after closing and reopening.
3. Open a Notion web workspace using your own test account, or a public page on a supported notion.site domain. Refresh once after installing. Notion account credentials are not requested or handled by Prism.
4. Verify the sidebar, neutral text, reading surfaces, menus and accents adopt the selected palette. Open a menu or navigate within Notion to check dynamic rendering.
5. In Background, upload a PNG/JPEG/WebP/AVIF/GIF/MP4/WebM. **Match image** creates a palette from the image. Compare a dark blue image with a bright warm image: text polarity, panels, borders, and accents should change. Choose **Choose theme**, pick a preset, and replace the image: the chosen preset and custom accent should remain. Return to **Match image** to restore automatic colors. Adjust dim, blur and focal position. Files and palette analysis stay local; GIFs should animate, and MP4/WebM files should loop silently with a pause/resume control. Show entire image must center and retain the full frame, with a soft copy filling unused space. Disable the soft-backdrop switch for plain theme-colored margins. Fill intentionally crops. Stretch to screen shows every edge without gaps by changing proportions; Revert restores the original frame. Low reading-panel opacity may be raised for contrast, as explained in Fine-tune. Tables, boards, lists, galleries, calendars, timelines and feeds remain transparent, with lightly tinted cards, narrow text halos and small readable status chips.
6. For URL import, paste a public direct HTTPS image URL and approve the specific host request. For a public metadata page with an image on a second host, grant the offered second-host permission and retry. Private/login-required sources are not supported.
   Use **Replace image** for a new file or **Use a link** for another URL. Canceling or a failed download must preserve the previous image. Public Pinterest short links should resolve automatically when available.
7. Turn Prism off. Its injected styling and wallpaper disappear and the original Notion appearance returns. Turn it back on to restore the saved choice.

## Before submitting

Choose the publisher's display name, support contact and public privacy-policy URL in the dashboard. Complete the current dashboard data-use questions against the actual code and policy. This text is prepared listing material, not a claim of store approval.
