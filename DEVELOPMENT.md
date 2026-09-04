# Stead — how the pieces fit

Stead is one repository with three product components and one pinned upstream
dependency.

```
  ui/                    ── sync script ──>   browser patches        ── launches ──>   brain/
  SvelteKit source        generated WebUI      Chromium integration                       Rust + Pie helper
                                assets
```

## Repository map

- **`ui/`** — Svelte source for the native WebUI surfaces.
- **`brain/`** — Rust agent helper and its pinned Pie source.
- **`patches/stead/`** — Stead's Chromium integration.
- **`resources/stead/sidebar/`** — generated UI bundle consumed by Chromium.
- **`helium-chromium/`** — upstream Helium submodule; do not put Stead-owned
  source here.

Edit the UI source under `ui/`, then sync it to refresh the committed browser
bundle. Browser, UI, and brain changes can now land atomically in one commit.

## Which folder do I edit?

| To change…                                              | Edit in…                 | See it via…                          |
| ------------------------------------------------------- | ------------------------ | ------------------------------------ |
| How the **UI** looks/works (chat, sidebar, new-tab)     | **`ui/`** (Svelte)       | `bun dev` — instant, in any browser  |
| **Browser-level** stuff (new page surface, native, brain wiring) | **this repo** (`patches/stead/…`) | a Stead build               |
| The **brain** (the agent itself)                        | **`brain/`** (Rust + Pie) | runs as a bundled helper process   |

UI work does not require a Chromium build.

## Day-to-day UI loop (the common case)

```sh
cd ui
bun dev          # edit Svelte, see it live in a normal browser. No Chromium build.
```

When you want those UI changes **inside the Stead browser**, run one command from
this repo:

```sh
./st run    # rebuilds the UI bundle and browser, then launches Stead
```

Use `resources/stead/sync_sidebar_ui.sh` directly only when you want to refresh
the committed bundle without compiling Chromium. Set
`STEAD_UI_DIR=/path/to/ui` only to test an alternate checkout.

## The one rule

The built UI inside this repo — `resources/stead/sidebar/` — is a **generated
copy**, like a compiled file. **Never edit it by hand.** Only edit the source in
`ui/`, then re-run the sync script to regenerate it.

## Building the actual browser

Needs a Mac (see [docs/building.md](docs/building.md)). The dev flow:

```sh
./st setup    # first time: check dependencies, fetch Chromium, apply patches
./st run      # refresh resources, build, and launch with a dev profile
```

`./st run` and `./st build` install the generated bundle from
`resources/stead/sidebar/` automatically. CI verifies that the committed bundle
is current.

## The WebUI surfaces (all from the one Svelte app)

| Svelte route   | Shows up as                          | Status                     |
| -------------- | ------------------------------------ | -------------------------- |
| `/ai-sidebar`  | **Ask Stead** side panel (toolbar)   | wired                      |
| `/ai-chat`     | full-page chat, `stead://chat/ai-chat` | wired                    |
| `/new-tab`     | new-tab page                         | wired                      |
| `/command-palette` | ⌘T command palette bubble (opt-in setting) | wired            |
| `/`            | (placeholder)                        | —                          |

Each surface is one small patch in `patches/stead/…` that points the **same**
bundle at a different route. Adding `/new-tab` later = the same pattern, no UI
rebuild.

## Where the branding lives

The "Chrome/Chromium/Helium → Stead" rename is `devutils/stead_name_substitution.py`,
run automatically by the build. The `helium-chromium` submodule stays untouched.
You don't need to think about it.

## The brain

A bundled Rust helper process that the browser launches and talks to over framed
JSON stdio. The UI talks to the browser; the browser talks to the brain. The
brain source lives in `brain/`, vendors pinned Pie under `brain/vendor/pie`,
and keeps browser tools mediated through the browser-side broker.

The Rust side is scaffolded and testable now:

```sh
cd brain
cargo test --workspace
cargo build --release -p stead-brain
```

The browser wiring now has a `BrainBroker`/`BrainConsole` Chromium patch that
launches `stead-brain` and bridges WebUI session/auth calls to the helper. The
patch also routes browser tool calls from `BrainBroker` back through
`AgentControl`. `sign_and_package_app.sh` installs the release helper into
`Stead.app/Contents/MacOS/stead-brain` before signing, so the helper is bundled
with the app; the remaining browser work is verifying the launch/routing path in
a Chromium build.
