# Chaos Control

A Manifest V3 keyboard launcher combining the functionality of `../chrome-tab-line` with the dark command-palette UI of `../dia-tab-line`. No build step or runtime dependencies.

## Features

- Search all open tabs, with exact matches first, local history suggestions, fuzzy matching and inline URL completion.
- Type a URL to navigate, switch to an existing matching tab, or search the web with your browser's default engine. ⌘↵ / Ctrl+Enter searches Google using the typed text.
- Press Tab for actions: Search BookMark, Search history, Pin/Unpin tab, Bookmark, Mute/Unmute tab, Duplicate current tab, Close other tabs, and Update.
- Browse and search bookmark folders. In Bookmark mode, Enter opens a folder, ⌘↵ saves the current page, and ⌥↵ creates a subfolder with the typed name.
- Search browser history across all dates with an 80 ms debounce and Load more in batches of 100 candidates. Main-search history suggestions remain limited to 11.
- ⌘T opens the launcher through a New Tab override. Switching to an existing tab closes the launcher tab; opening a new URL reuses it. Tab actions target the page used before the launcher.
- ⌘K or the toolbar icon opens an overlay. Restricted browser pages, or an embedded launcher that does not respond within three seconds, use a centered popup window instead.
- Dia Tab Line's dark colors, aurora background, colored result icons, animated selection and reduced-motion support.

All source data stays in the browser. The extension includes no analytics or remote runtime dependencies. Permissions match Chrome Tab Line: `tabs`, `bookmarks`, `history`, `favicon`, `search`, `scripting`, and `activeTab`.

## Install

1. Open your Chromium browser's extension manager (`chrome://extensions` in Chrome) and enable Developer mode.
2. Choose **Load unpacked** and select this project's **extension** folder.
3. Keep the extension's New Tab override when prompted.
4. Open a new tab, use the toolbar icon, or press ⌘K (Alt+Shift+K on Windows/Linux). If necessary, assign the shortcut to **Chaos Control → Activate the extension** in the browser's extension shortcut settings.

After local file changes, choose **Actions → Update** and reopen the launcher. This reloads files already on disk.

Browser-specific shortcut handling and the installed extension require verification in the target browser. Native pages, extension pages and the Web Store cannot host overlays, so they use the popup fallback. Close other tabs closes all other tabs, including pinned tabs, in the current window.

## Development

```sh
npm run check
node tests/preview-server.js
```

Open [the synthetic preview](http://127.0.0.1:4317/extension/launcher.html). Add `?view=tab`, `?view=overlay`, or `?view=popup` to inspect each view. [The overlay preview](http://127.0.0.1:4317/tests/overlay-preview.html) exercises the focus handoff. Set `PORT` to use another port.

The preview uses synthetic browser data and does not read or modify real tabs, history or bookmarks. It simulates tab actions and folder/save acknowledgements; real bookmark persistence, extension reloads and native New Tab navigation need an installed-extension check.

There are no unit tests. `npm run check` validates JavaScript syntax; `tests/` contains preview tooling only.
