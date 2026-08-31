# Stead browser

Stead is a Chromium browser built on Helium with a native AI agent. The product
should retain full browser feature parity with Helium while keeping
Stead-specific code small, fast, and easy to rebase. Stead is a new fork and
does not preserve Helium's developer command names or shell workflow.

These instructions apply to the entire repository. A more specific
`AGENTS.md` adds rules for its own subtree.

## Product invariants

- Preserve Helium browser behavior. Stead features should be additive unless
  the user explicitly asks to replace an upstream behavior. This does not
  require compatibility with Helium's developer CLI.
- Protect browser performance. Consider startup time, first paint, tab memory,
  input latency, sidebar rendering, and background CPU before adding work.
- Keep the architecture native. The WebUI talks to Chromium, Chromium mediates
  browser capabilities, and the out-of-process Rust brain handles agent logic.
  Do not reintroduce extension service workers, content-script bridges, CDP
  automation, or local proxy layers for convenience.
- Keep privileged browser actions scoped and reversible. Respect the current
  tab, window, profile, session ownership, and approval boundaries. If a user
  can grant, attach, or take over something, provide a clear way to revoke,
  detach, or release it.
- Fail clearly and early. Missing tools, unavailable helpers, stale patches,
  and unsupported environments should produce an actionable message, not a
  crash after a long build or a half-mutated setup.
- Keep the open client buildable without private source, embedded credentials,
  or access to production services.

## Project language

- **Helium** means the pinned upstream patch tree in `helium-chromium/`.
- **Chromium tree** means the generated working source under `build/src/`.
- **Stead patch** means a Stead-owned Chromium diff under `patches/stead/`.
- **WebUI** means the Svelte interface in `ui/`, including sidebar, chat,
  new-tab, and settings routes.
- **brain** means the Rust helper under `brain/` that runs outside the browser.
- **broker** means the native Chromium layer between WebUI Mojo interfaces,
  browser capabilities, and the brain's framed JSON protocol.
- **dev profile** means the developer's persistent Stead profile. Automated
  tests must use a disposable profile instead.

## Upstream and vendored boundaries

- Treat `helium-chromium/` as a read-only upstream Git submodule. Do not edit,
  format, delete, rename, or generate files inside it.
- Do not change the `helium-chromium` submodule pointer unless the user
  explicitly requests an upstream Helium update.
- Put Stead-owned Chromium changes in `patches/stead/` and list them in
  `patches/series`. If work appears to require editing Helium itself, stop and
  explain the boundary to the user.
- Treat `brain/vendor/` as vendored code unless the user explicitly requests a
  vendor update. Follow any instruction file inside that subtree.
- Do not remove, empty, rename, or bypass an `AGENTS.md`. Read every instruction
  file that applies to the files being changed.

## Sources of truth

- Browser integration lives in `patches/stead/`. `build/src/` is generated
  working state. A temporary edit there is acceptable for compilation or
  debugging only when the final edit is also captured in the relevant patch.
- `patches/series` is the committed patch order. `patches/series.merged` is
  generated setup state and must not become the source of truth.
- UI source lives in `ui/`. Never hand-edit the generated
  `resources/stead/sidebar/` bundle. Regenerate it with
  `resources/stead/sync_sidebar_ui.sh`.
- Brain source lives in the non-vendored parts of `brain/`.
- Repository scripts and documentation live at the root, in `devutils/`,
  `resources/stead/`, and `docs/`. Prefer a Stead-owned wrapper over modifying
  an upstream tool.

## The easiest ways to damage the project

- Do not make a fix only in `build/src/`. It will disappear on the next setup.
- Do not force a Quilt patch through drift. Rebase the patch against the pinned
  source and keep its context narrow enough to review.
- Do not treat a timeout as a successful build or startup test. Check the exit
  status and inspect fatal logs.
- Do not run automated launches against the developer's persistent profile.
  Use a temporary `--user-data-dir` and remove only that exact directory.
- Do not kill processes by name, path, or pattern. Kill only a PID captured
  when the process was started.
- Do not run `./st reset`, `./st setup --force`, delete `build/src/`, or discard
  a dirty patch stack unless the user asked for that destructive action.
- Do not install system prerequisites on the user's behalf. `./st doctor`
  should identify each missing tool and print the install command.
- Never commit or print provider API keys, session data, browser profiles, or
  authentication material.

## Check every affected path

Before calling a product change complete, decide which of these apply:

- **WebUI surfaces.** Sidebar, full-page chat, new tab, and settings can share
  code but have different routes and host behavior.
- **Native entry points.** Toolbar actions, side-panel registration, menus,
  omnibox routing, and internal `stead://` pages may expose the same feature.
- **Browser scope.** Check tab switching, window changes, profile separation,
  session teardown, and browser shutdown. Global state is usually the wrong
  default for agent behavior.
- **Contracts.** Mojo definitions, C++ implementations, generated TypeScript,
  and the brain's framed JSON protocol must change together.
- **Helper states.** Check helper missing, launch failure, early exit, malformed
  output, and browser teardown. An unavailable brain must not crash Chromium.
- **Reverse states.** Closing, cancelling, revoking, detaching, and retrying are
  part of the feature, not cleanup work for later.
- **Build forms.** Consider the development app, packaged app, Apple Silicon,
  and Intel when paths, helper binaries, signing, or bundle contents change.
- **Documentation.** User-visible commands belong in `README.md` or
  `docs/building.md`; architecture and contributor rules belong in
  `DEVELOPMENT.md` or this file.

## Development commands

- `./st doctor` checks prerequisites and must not mutate the repository.
- `./st setup` prepares sources, resources, patches, and build configuration.
  It should be safe to retry and should not compile Chromium.
- `./st build` refreshes generated resources, builds changed browser code, and
  installs the brain helper without launching.
- `./st run` builds and launches. `./st run --no-build` deliberately launches
  the last successful binary without refreshing anything.
- `./st help` is the canonical command reference. `./st` is the only supported
  developer command entry point. Do not add `he`, `./dev`, or sourced-shell
  compatibility aliases.
- A completed setup can outlive a newly added prerequisite, so build commands
  must still run preflight checks before expensive or mutating work.
- Chromium builds are large. Do not assume a quiet or slow compile is hung.
  Inspect its process and progress before interrupting it.

## Patch discipline

- Keep patches focused on one behavior and give them descriptive names.
- Add every new patch to `patches/series` in dependency order.
- Preserve upstream context and avoid unrelated formatting in patches. Large
  context offsets often mean the patch needs a real rebase.
- When debugging in `build/src/`, reproduce the final fix in the root patch,
  then compile from the generated tree. Verify the patch file is parseable.
- Early Chromium lifecycle hooks matter. Register profile services during the
  designated factory-registration phase, register each WebUI's interfaces as
  one group, and avoid blocking filesystem or process work on the UI thread.
- Missing optional runtime pieces should degrade to an unavailable feature.
  Required build pieces belong in preflight and packaging checks.

## Verification

Use the smallest proof that can fail for the behavior you changed, then widen
only when the risk requires it.

- CLI and setup changes: `bash tests/dev_cli_test.sh`, plus `bash -n` or
  `zsh -n` for each changed shell script.
- Stead tooling and patch assertions:
  `python3 -m unittest discover -s devutils/tests -p 'test_*.py'`.
- UI changes: run `bun run check` in `ui/`, regenerate the sidebar bundle, and
  verify the committed generated output matches the source.
- Brain changes:
  `cargo test --manifest-path brain/Cargo.toml --workspace --locked`.
- Chromium changes: compile the narrowest affected target first. Run a full
  browser build when changing shared headers, patch ordering, build files,
  startup lifecycle, packaging, or cross-component interfaces.
- Startup changes need a real launch test. Use a disposable profile, confirm
  the process remains alive for the intended interval, and fail on `FATAL`,
  `DCHECK failed`, or `Check failed` output. Compilation alone is insufficient.
- Performance claims need a measurement against a relevant baseline. Avoid
  continuously repainting WebUI animations and unnecessary work during browser
  startup, navigation, tab switching, or first paint.
- Do not run an expensive full Chromium build for documentation-only or other
  isolated changes. CI owns clean-checkout coverage; local checks should match
  the risk of the change.

Tests should assert observable behavior or meaningful state. Do not add tests
that merely duplicate implementation text unless the text itself is the patch
or generated artifact contract being protected.

## Changes, docs, and pull requests

- Preserve unrelated user changes in dirty working trees. Never reset or
  overwrite them to complete a task.
- Do not commit implementation plans, research scratch files, crash dumps,
  temporary profiles, or PR-only screenshots.
- Update documentation in the same change when commands, prerequisites,
  architecture, bundle layout, or developer workflow changes.
- Every code-change handoff must include a short "How to test" section with the
  working directory, exact commands, and expected behavior. For UI-only work,
  give `cd ui` followed by `bun dev`; also offer `./st run` from the repository
  root when native browser integration matters. For full-browser work, explain
  that `./st setup` is needed only when setup is incomplete, then use
  `./st run`. Do not tell users to rebuild unrelated parts of the project.
- Separate checks already run by the agent from manual verification the user
  can perform. Never claim that a compile-only check proves startup or visible
  behavior.
- Do not create commits, push branches, or open pull requests unless the user
  explicitly asks.
- Keep one concern per pull request. UI changes should include before-and-after
  evidence, and motion changes should include a short recording.

## Engineering taste

- Understand the constraint, then choose the smallest design that makes the
  correct behavior unsurprising.
- Do not preserve complexity only because it exists, and do not add machinery
  for hypothetical future needs.
- Put complexity at process and protocol boundaries. Keep WebUI components,
  browser orchestration, and helper responsibilities easy to trace.
- Comments should explain lifecycle, ownership, protocol, or non-obvious usage.
  Do not narrate straightforward lines of code.
- If a rule conflicts with the task, state the conflict and get the user's
  explicit approval before breaking it.
