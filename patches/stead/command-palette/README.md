# Stead command palette (Cmd+T popup)

An opt-in Arc-style command bar: with the setting enabled, the new-tab shortcut
(⌘T / Ctrl+T) opens a floating search popup over the current window instead of
a blank tab. Typing searches open tabs, bookmarks, and history; Enter switches
to the tab, opens the URL/search in a new tab, or hands the text to Ask Stead.
Esc, focus loss, or activating another tab closes it. Off by default, so Helium
behaviour is unchanged until the user turns it on.

## How it works

- **UI** is the SvelteKit `/command-palette` route from the shared bundle
  (`ui/src/routes/command-palette`, bridge in `ui/src/lib/palette.ts`). Under
  `bun dev` it runs against sample data; inside the browser it talks to the
  native controller with `chrome.send()` and receives results through
  `window.steadPaletteResults(requestId, results)`.
- **Hosting** reuses Chromium's `WebUIBubbleManager` / `WebUIBubbleDialogView`
  (the same machinery as Tab Search), so we get a native bubble widget with
  auto-resize, a cached WebContents between shows, Esc-to-close, and
  close-on-tab-activation for free. Nothing is injected into pages.
- **Scope.** `SteadCommandPaletteBubbleHost` is per browser window
  (`BrowserWindowFeatures`, normal windows only, UnownedUserData on the window).
  Results list the opening window's tabs first; opening a result navigates in
  that window; switching tabs may activate another window of the same profile.
  Incognito windows use their own profile's history/bookmarks.
- **Routing.** `BrowserCommandController` checks the pref on `IDC_NEW_TAB`. If
  the window has a palette host, it toggles the bubble; otherwise (app/popup
  windows) it falls through to `NewTab()`. The new-tab button and menus still
  call `IDC_NEW_TAB`, so they follow the same setting.
- **Classification.** Free text is passed through `AutocompleteClassifier`, so
  URL fixup and the default search engine match the omnibox.

## Patches

- `command-palette-files.patch` — new files only:
  `chrome/browser/ui/webui/stead_command_palette/stead_command_palette_ui.{h,cc}`
  (`TopChromeWebUIController` + `DefaultTopChromeWebUIConfig` with
  `ShouldAutoResizeHost()`; search/open/close message handlers) and
  `chrome/browser/ui/views/stead_command_palette/stead_command_palette_bubble_host.{h,cc}`
  (owns the `WebUIBubbleManager`, anchors the bubble near the top of the
  content area with `BubbleBorder::NONE`).
- `register-command-palette.patch` — shared-file hunks: URL constants
  (`command-palette.top-chrome`, the Top Chrome host class the bubble wrapper
  requires), `chrome_web_ui_configs.cc`, `chrome/browser/ui/BUILD.gn`,
  `IDS_STEAD_COMMAND_PALETTE_TITLE`, the `.SteadCommandPalette` WebUI-name
  histogram variant (`WebUIContentsWrapperT` static-asserts the name), and
  `BrowserWindowFeatures` ownership.
- `command-palette-on-new-tab-setting.patch` — the
  `stead.browser.command_palette_on_new_tab` pref (registered in
  `browser_ui_prefs.cc`, allowlisted for `settings_private`), its toggle in
  Settings › Appearance › Behavior next to Helium's tab options, and the
  `IDC_NEW_TAB` routing in `browser_command_controller.cc`.

All hunks were generated against the Chromium 149.0.7827.200 source with the
full Helium + Stead stack applied, so they should apply without fuzz.

## Notes

- `getSteadTheme` is registered as a no-op because the shared root layout sends
  it from every surface; an unhandled `chrome.send` is a `DUMP_WILL_BE_NOTREACHED`.
- The bubble hides until the page reports `steadPaletteReady`, so the first
  open paints real content rather than a blank frame. Re-shows of the cached
  contents get `steadPaletteReset()` to clear the previous query.
- Not yet compiled here (no macOS build box). First build should confirm the
  `contents_container()` anchor, the `//chrome/browser/ui` deps for
  `//components/omnibox/browser` and history/bookmarks (already direct deps of
  the `ui` target), and that `views::BubbleBorder::NONE` positions as intended.
