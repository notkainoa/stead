# Stead browser

Stead is a Chromium browser built on Helium with a native AI agent. The product
should retain full browser feature parity with Helium while keeping
Stead-specific code small, fast, and easy to rebase.

These instructions apply to the entire repository. A more specific
`AGENTS.md` adds rules for its own subtree.

## Product invariants

- Preserve Helium browser behavior. Stead features should be additive unless
  the user explicitly asks to replace an upstream behavior.
- Protect browser performance. Consider startup time, first paint, tab memory,
  input latency, sidebar rendering, and background CPU before adding work.
- Keep the architecture native. The WebUI talks to Chromium, Chromium mediates
  browser capabilities, and the out-of-process Rust brain handles agent logic.
  Do not reintroduce extension service workers, content-script bridges, CDP
  automation, or local proxy layers for convenience.
- Keep privileged browser actions scoped and reversible. If a user can grant,
  attach, or take over something, provide a clear way to revoke, detach,
  or release it.
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
  working state. A fix there alone disappears on the next setup; capture the
  final edit in the relevant patch.
- `patches/series` is the committed patch order. `patches/series.merged` is
  generated setup state and must not become the source of truth.
- Never hand-edit the generated `resources/stead/sidebar/` bundle. Regenerate
  it with `resources/stead/sync_sidebar_ui.sh`. Prefer a Stead-owned wrapper
  over modifying an upstream tool.

## The easiest ways to damage the project

- Do not make a fix only in `build/src/`. It will disappear on the next setup.
- Do not force a Quilt patch through drift. Rebase the patch against the pinned
  source and keep its context narrow enough to review.
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

Before calling a product change complete, consider:

- **Contracts.** Mojo definitions, C++ implementations, generated TypeScript,
  and the brain's framed JSON protocol must change together.
- **Scope.** Tab switching, window changes, profile separation, session
  teardown, and shutdown. Global state is usually the wrong default, and
  closing, cancelling, revoking, detaching, and retrying are part of the
  feature.
- **Docs.** User-visible commands belong in `README.md` or `docs/building.md`;
  architecture and contributor rules belong in `DEVELOPMENT.md` or this file.

## Development commands

- `./st doctor` checks prerequisites and must not mutate the repository.
- `./st setup` prepares sources, resources, patches, and build configuration.
- `./st build` refreshes generated resources, builds changed browser code, and
  installs the brain helper without launching.
- `./st run` builds and launches.
- Do not run `./st run` unless the user explicitly asks for a browser launch.
  Prefer `./st build` for agent verification.
- `./st help` is the canonical command reference. `./st` is the only supported
  developer command entry point.

## Patch discipline

- Keep patches focused on one behavior and give them descriptive names.
- Add every new patch to `patches/series` in dependency order.
- Quilt reads the generated `patches/series.merged`, not `patches/series`.
  After touching `patches/series` or any file under `patches/stead/`, never
  trust `already fully applied`: regenerate with `./st pop`, `./st unmerge`,
  `./st merge`, `./st setup`, then prove the patch is applied with
  `quilt applied | tail` and `grep -r <unique_symbol> build/src/...`.
  Setup, push, and build now fail loudly on a stale `series.merged` instead
  of silently building the old tree.
- Preserve upstream context and avoid unrelated formatting in patches. Large
  context offsets often mean the patch needs a real rebase.
- Missing optional runtime pieces should degrade to an unavailable feature.
  Required build pieces belong in preflight and packaging checks.

## Verification

Use the smallest proof that can fail for the behavior you changed.

- CLI changes: `tests/dev_cli_test.sh`.
- Stead tooling: `devutils/tests`.
- UI changes: `bun run check` in `ui/`, plus a sidebar bundle regen when UI
  output changes.
- Brain changes: `cargo test` in `brain/`.
- Chromium changes: compile the narrowest affected target first.
- Startup changes need a real launch test, which requires explicit user approval
  to run `./st run`. Without approval, compile only and mark launch verification
  as a manual follow-up. An unavailable brain must not crash Chromium.

## Changes, docs, and pull requests

- Preserve unrelated user changes in dirty working trees. Never reset or
  overwrite them to complete a task.
- Update documentation in the same change when commands, prerequisites,
  architecture, bundle layout, or developer workflow changes.
- Every code-change handoff must include a short "How to test" section with the
  working directory, exact commands, and expected behavior. Prefer the lightest
  check that proves the change: for UI-only work, give `cd ui` followed by
  `bun dev` first, then note `./st run` from the repository root as the optional
  full browser check when native integration matters. These are manual steps for
  the user; they do not authorize the agent to run `./st run` itself without an
  explicit launch request.
- Separate checks already run by the agent from manual verification the user
  can perform. Never claim that a compile-only check proves startup or visible
  behavior.
- Do not create commits, push branches, or open pull requests unless the user
  explicitly asks.

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
