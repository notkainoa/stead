# Stead

**Stead** is a performance-first, agentic web browser built as a Chromium fork.

Its goal: keep the *full* agentic capability of any website — the agent can
perceive and act on any page — while being one of the most performant AI browsers
out there. The thesis is that the bottleneck in today's AI browsers isn't the
model, it's the **overhead layer** stacked around it (extension service-workers,
per-tab content scripts, JSON message-passing, local proxies, CDP automation, an
external daemon). Stead's fix: make everything the user touches **native**, and
keep only the inference host out-of-process.

This repository contains the complete open Stead client: the **macOS browser**,
the SvelteKit **WebUI**, and the bundled Rust **agent helper**. The browser forks
[helium-macos](https://github.com/imputnet/helium-macos) and embeds the shared
[Helium](https://github.com/imputnet/helium) patch tree as the `helium-chromium`
submodule. All of Stead's own Chromium changes are isolated in `patches/stead/`
so they stay portable across upstream churn.

## Repository layout

- `ui/` — SvelteKit source for chat, sidebar, settings, and new-tab surfaces.
- `brain/` — Rust helper launched and bundled by the browser.
- `patches/stead/` — Stead-owned Chromium integration.
- `resources/stead/sidebar/` — generated UI bundle committed for Chromium builds.
- `helium-chromium/` — pinned upstream Helium submodule.

The UI is compiled to static assets and served as native Chromium **WebUI**
surfaces—no extension or content scripts. Run
`resources/stead/sync_sidebar_ui.sh` after UI changes to refresh the committed
bundle.

## Status

UI layer wired (the agent "brain" is the next phase):

- Helium → Stead rebrand (app, packaging, in-browser strings, internal `stead://` scheme)
- **Ask Stead** side panel (pinned toolbar button → the agent sidebar)
- Full-page chat at `stead://chat`
- Custom **new tab page** (prerendered, paints instantly), replacing Chrome's NTP

## Clone and develop

Clone with submodules so the pinned `helium-chromium` source is initialized:

```sh
git clone --recurse-submodules https://github.com/notkainoa/stead.git
cd stead
```

If you already cloned without submodules, initialize them afterward:

```sh
git submodule update --init --recursive
```

For a fast UI-only development loop, install
[Bun](https://bun.com/docs/installation), then run:

```sh
cd ui
bun install --frozen-lockfile
bun dev
```

This opens the SvelteKit UI in a regular browser. It does not exercise Stead's
native Chromium integration.

To build and run the complete macOS browser, run these commands from the
repository root:

```sh
./st setup
./st run
```

`./st setup` checks every prerequisite first and prints the install command for
anything missing. It then initializes submodules, builds the sidebar resources,
downloads Chromium, and prepares the patched source tree. It is safe to retry
after a failure and safe to run after setup is complete; use
`./st setup --force` to recreate a completed environment.

`./st run` refreshes the sidebar resources, builds changed code, and launches
Stead. The first build requires substantial disk space and can take a while.
Use `./st build` when you only want to compile, or `./st run --no-build` when
you deliberately want to launch the existing binary. See
[docs/building.md](docs/building.md) for the prerequisite list and full workflow.

## Testing your changes

Every change should be handed off with the exact commands needed to test it,
including the directory to run them from and what behavior to check.

For a UI-only change, use the fast browser preview. This repository uses Bun,
so run:

```sh
cd ui
bun dev
```

The preview exercises the Svelte interface without rebuilding Chromium. To
check that the UI still type-checks and builds, run `bun run check` from `ui/`.

To test the complete Stead browser, return to the repository root and run:

```sh
./st setup  # first checkout only, or when setup is incomplete
./st run
```

After a successful setup, normal changes only need `./st run`. It refreshes the
UI bundle, compiles changed code, installs the brain helper, and launches Stead.
Use `./st run --no-build` only when you intentionally want to launch the last
successful binary without testing new source changes.

Useful focused checks include:

```sh
bash tests/dev_cli_test.sh
python3 -m unittest discover -s devutils/tests -p 'test_*.py'
cargo test --manifest-path brain/Cargo.toml --workspace --locked
```

Run the checks that match the files you changed. A handoff should distinguish
checks already completed from commands the next developer should run manually.

## Build a DMG

Build a DMG for the current Mac architecture from the repository root:

```sh
resources/stead/sync_sidebar_ui.sh
./build.sh
```

On Apple Silicon, pass `x86_64` to produce an Intel build instead:

```sh
./build.sh x86_64
```

The resulting `.dmg` is written under `build/`. Without a Developer ID signing
identity, the build uses ad-hoc signing, which is suitable for local testing but
not distribution. See [docs/building.md](docs/building.md) for dependencies,
signing, troubleshooting, and the complete build workflow, and
[DEVELOPMENT.md](DEVELOPMENT.md) for the repository architecture.

## Credits

### Helium
Stead is based on [Helium](https://github.com/imputnet/helium) and
[helium-macos](https://github.com/imputnet/helium-macos) by imputnet. The
`helium-chromium` submodule tracks the upstream Helium patch tree — huge thanks
to the Helium authors for the foundation this builds on.

### ungoogled-chromium-macos
Helium's macOS tooling is in turn based on
[ungoogled-chromium-macos](https://github.com/ungoogled-software/ungoogled-chromium-macos).
Thanks to everyone behind ungoogled-chromium.

## License

Stead is open source under the **GNU General Public License v3.0**. All code,
patches, and modified portions unique to this repository are licensed under
GPL-3.0 — see [LICENSE](LICENSE).

Imported content keeps its original license: content from Helium remains
GPL-3.0, and unmodified code from ungoogled-chromium remains under its
[BSD 3-Clause license](LICENSE.ungoogled_chromium). GPL-3.0 (unlike AGPL) does
not reach across the network, so Stead's open client pairs with a separate
proprietary cloud/subscription backend.
