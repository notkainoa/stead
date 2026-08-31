#!/usr/bin/env bash

set -u

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

stead_cli() {
  (__stead_menu "$@")
}

test_setup_preflights_before_mutating() (
  fixture_root="$(mktemp -d /tmp/stead-dev-test.XXXXXX)"
  trap 'rm -rf "$fixture_root"' EXIT

  mkdir -p "$fixture_root/devutils" "$fixture_root/src/out/Default"
  printf '%s\n' \
    '#!/usr/bin/env bash' \
    'if [ -e "$STEAD_TEST_ROOT/patches.merged" ]; then' \
    '  echo "patches/series.merged already exists" >&2' \
    '  exit 1' \
    'fi' \
    'touch "$STEAD_TEST_ROOT/patches.merged"' \
    > "$fixture_root/devutils/update_patches.sh"
  chmod +x "$fixture_root/devutils/update_patches.sh"

  export STEAD_TEST_ROOT="$fixture_root"
  zsh -c '
    source "$1"
    _root_dir="$STEAD_TEST_ROOT"
    _src_dir="$STEAD_TEST_ROOT/src"
    _out_dir="$_src_dir/out/Default"
    _setup_marker="$_out_dir/.stead-setup-complete"
    _presetup_marker="$_out_dir/.stead-presetup-complete"

    ___helium_setup_presetup() { :; }
    ___helium_configure() { :; }

    # The fixed setup preflight uses these probes. Everything except quilt is
    # present so the assertion stays focused on the reported regression.
    ___stead_has_command() { [ "$1" != "quilt" ]; }
    ___stead_python_is_supported() { :; }
    ___stead_python_has_module() { :; }
    ___stead_has_metal_toolchain() { :; }
    ___stead_has_brew_formula() { :; }
    ___stead_xcode_is_supported() { :; }
    ___stead_macos_is_supported() { :; }

    PATH=/usr/bin:/bin
    first_output="$(__stead_menu setup 2>&1)"
    first_status=$?
    second_output="$(__stead_menu setup 2>&1)"
    second_status=$?
    printf "%s" "$first_output" > "$STEAD_TEST_ROOT/first.output"
    printf "%s" "$second_output" > "$STEAD_TEST_ROOT/second.output"
    printf "%s" "$first_status" > "$STEAD_TEST_ROOT/first.status"
    printf "%s" "$second_status" > "$STEAD_TEST_ROOT/second.status"
  ' _ "$repo_root/dev.sh"

  first_output="$(<"$fixture_root/first.output")"
  second_output="$(<"$fixture_root/second.output")"
  first_status="$(<"$fixture_root/first.status")"
  second_status="$(<"$fixture_root/second.status")"

  [ "$first_status" -ne 0 ] || fail "setup unexpectedly succeeded without quilt"
  [ "$second_status" -ne 0 ] || fail "setup retry unexpectedly succeeded without quilt"
  [ ! -e "$fixture_root/patches.merged" ] || fail "setup mutated patch state before checking quilt"
  [[ "$first_output" == *"brew install quilt"* ]] || fail "setup did not print the quilt install command"
  [[ "$second_output" != *"already exists"* ]] || fail "setup retry repeated patch merging after a prerequisite failure"
)

test_doctor_reports_missing_cargo() (
  # shellcheck source=../dev.sh
  source "$repo_root/dev.sh"

  # Keep this assertion focused on the helper toolchain added to the build.
  ___stead_has_command() { [ "$1" != "cargo" ]; }
  ___stead_python_is_supported() { :; }
  ___stead_python_has_module() { :; }
  ___stead_has_metal_toolchain() { :; }
  ___stead_has_brew_formula() { :; }
  ___stead_xcode_is_supported() { :; }
  ___stead_macos_is_supported() { :; }

  output="$(stead_cli doctor 2>&1)"
  status=$?

  [ "$status" -ne 0 ] || fail "doctor unexpectedly succeeded without cargo"
  [[ "$output" == *"Rust/Cargo"* ]] || fail "doctor did not identify the missing Rust toolchain"
  [[ "$output" == *"brew install rust"* ]] || fail "doctor did not print the Rust install command"
)

test_completed_setup_is_a_noninteractive_noop() (
  fixture_root="$(mktemp -d /tmp/stead-dev-test.XXXXXX)"
  trap 'rm -rf "$fixture_root"' EXIT
  mkdir -p "$fixture_root/out"
  touch "$fixture_root/out/.stead-setup-complete"

  # shellcheck source=../dev.sh
  source "$repo_root/dev.sh"
  _out_dir="$fixture_root/out"
  _setup_marker="$_out_dir/.stead-setup-complete"
  _presetup_marker="$_out_dir/.stead-presetup-complete"
  ___stead_preflight() { fail "completed setup ran the prerequisite check"; }

  output="$(stead_cli setup 2>&1)"
  status=$?

  [ "$status" -eq 0 ] || fail "completed setup did not exit successfully"
  [[ "$output" == *"already complete; nothing to do"* ]] || fail "completed setup did not explain the no-op"
  [[ "$output" == *"./st setup --force"* ]] || fail "completed setup did not explain how to redo it"
)

test_force_recreates_a_completed_setup() (
  fixture_root="$(mktemp -d /tmp/stead-dev-test.XXXXXX)"
  trap 'rm -rf "$fixture_root"' EXIT
  mkdir -p "$fixture_root/devutils" "$fixture_root/out"
  touch "$fixture_root/out/.stead-setup-complete"
  : > "$fixture_root/calls"
  printf '%s\n' \
    '#!/usr/bin/env bash' \
    'printf "merge\\n" >> "$STEAD_TEST_LOG"' \
    > "$fixture_root/devutils/update_patches.sh"
  chmod +x "$fixture_root/devutils/update_patches.sh"

  # shellcheck source=../dev.sh
  source "$repo_root/dev.sh"
  export STEAD_TEST_LOG="$fixture_root/calls"
  _root_dir="$fixture_root"
  _src_dir="$fixture_root/src"
  _out_dir="$fixture_root/out"
  _setup_marker="$_out_dir/.stead-setup-complete"
  _presetup_marker="$_out_dir/.stead-presetup-complete"

  ___stead_preflight() { printf 'preflight\n' >> "$STEAD_TEST_LOG"; }
  ___stead_prepare_submodules() { printf 'submodules\n' >> "$STEAD_TEST_LOG"; }
  ___stead_validate_patch_syntax() { printf 'patches\n' >> "$STEAD_TEST_LOG"; }
  ___stead_sync_resources() { printf 'resources\n' >> "$STEAD_TEST_LOG"; }
  ___stead_clean_incomplete_setup() { printf 'clean\n' >> "$STEAD_TEST_LOG"; }
  ___helium_setup_presetup() { mkdir -p "$_src_dir"; printf 'presetup\n' >> "$STEAD_TEST_LOG"; }
  ___stead_patch_stack_is_fully_applied() { return 1; }
  ___stead_quilt() { printf 'quilt\n' >> "$STEAD_TEST_LOG"; }
  ___helium_configure() { printf 'configure\n' >> "$STEAD_TEST_LOG"; }

  stead_cli setup --force >/dev/null

  expected=$'preflight\nsubmodules\npatches\nresources\nclean\npresetup\nmerge\nquilt\nconfigure'
  actual="$(<"$STEAD_TEST_LOG")"
  [ "$actual" = "$expected" ] || fail "forced setup ran the wrong sequence: $actual"
  [ -f "$_setup_marker" ] || fail "forced setup did not write its completion marker"
)

test_run_builds_before_launching() (
  fixture_root="$(mktemp -d /tmp/stead-dev-test.XXXXXX)"
  trap 'rm -rf "$fixture_root"' EXIT
  call_log="$fixture_root/calls"

  # shellcheck source=../dev.sh
  source "$repo_root/dev.sh"
  ___helium_build() { printf 'build\n' >> "$call_log"; }
  ___helium_launch() { printf 'launch\n' >> "$call_log"; }

  stead_cli run
  [ "$(<"$call_log")" = $'build\nlaunch' ] || fail "run did not build before launch"

  : > "$call_log"
  stead_cli run --no-build
  [ "$(<"$call_log")" = "launch" ] || fail "run --no-build unexpectedly compiled"
)

test_patch_failure_is_resumable() (
  fixture_root="$(mktemp -d /tmp/stead-dev-test.XXXXXX)"
  trap 'rm -rf "$fixture_root"' EXIT
  mkdir -p "$fixture_root/src/out/Default" "$fixture_root/patches"
  touch "$fixture_root/src/out/Default/.stead-presetup-complete"
  touch "$fixture_root/patches/series.merged"

  # shellcheck source=../dev.sh
  source "$repo_root/dev.sh"
  _root_dir="$fixture_root"
  _src_dir="$fixture_root/src"
  _out_dir="$_src_dir/out/Default"
  _setup_marker="$_out_dir/.stead-setup-complete"
  _presetup_marker="$_out_dir/.stead-presetup-complete"

  ___stead_preflight() { :; }
  ___stead_prepare_submodules() { :; }
  ___stead_validate_patch_syntax() { :; }
  ___stead_sync_resources() { :; }
  ___stead_clean_incomplete_setup() { fail "resumable setup deleted the prepared source"; }
  ___helium_setup_presetup() { fail "resumable setup repeated source preparation"; }
  ___stead_patch_stack_is_fully_applied() { return 1; }
  ___stead_quilt() { return 1; }
  ___helium_configure() { fail "setup configured after a patch failure"; }

  output="$(stead_cli setup 2>&1)"
  status=$?

  [ "$status" -ne 0 ] || fail "patch failure unexpectedly succeeded"
  [ -d "$_src_dir" ] || fail "patch failure removed the prepared source"
  [[ "$output" == *"prepared source tree has been preserved"* ]] || fail "patch failure did not explain recovery"
  [[ "$output" == *"rerun './st setup' to resume"* ]] || fail "patch failure did not give the resume command"
)

test_fully_applied_patch_stack_is_success() (
  fixture_root="$(mktemp -d /tmp/stead-dev-test.XXXXXX)"
  trap 'rm -rf "$fixture_root"' EXIT
  mkdir -p "$fixture_root/src/out/Default" "$fixture_root/patches"
  touch "$fixture_root/src/out/Default/.stead-presetup-complete"
  printf 'stead/final.patch\n' > "$fixture_root/patches/series.merged"

  # shellcheck source=../dev.sh
  source "$repo_root/dev.sh"
  _root_dir="$fixture_root"
  _src_dir="$fixture_root/src"
  _out_dir="$_src_dir/out/Default"
  _setup_marker="$_out_dir/.stead-setup-complete"
  _presetup_marker="$_out_dir/.stead-presetup-complete"

  ___stead_preflight() { :; }
  ___stead_prepare_submodules() { :; }
  ___stead_validate_patch_syntax() { :; }
  ___stead_sync_resources() { :; }
  ___stead_quilt() {
    [ "$1" = "top" ] || fail "fully applied stack attempted another push"
    printf 'stead/final.patch\n'
  }
  ___helium_configure() { :; }

  output="$(stead_cli setup 2>&1)"
  status=$?

  [ "$status" -eq 0 ] || fail "fully applied patch stack was treated as a failure"
  [[ "$output" == *"already fully applied"* ]] || fail "fully applied stack was not recognized"
  [ -f "$_setup_marker" ] || fail "setup did not complete after recognizing the patch stack"
)

test_help_is_an_explicit_command() (
  # shellcheck source=../dev.sh
  source "$repo_root/dev.sh"

  output="$(stead_cli help 2>&1)"
  [[ "$output" == *"usage: st <command>"* ]] || fail "st help did not show st usage"
  [[ "$output" == *"setup [--force]"* ]] || fail "st help omitted setup"
  ! declare -F he >/dev/null || fail "legacy he command is still defined"
  ! declare -F st >/dev/null || fail "sourced dev.sh still defines a public st function"

  output="$(stead_cli definitely-not-a-command 2>&1)"
  status=$?
  [ "$status" -eq 2 ] || fail "unknown st command did not exit with status 2"
  [[ "$output" == *"Unknown command"* ]] || fail "unknown st command was not identified"
)

run_test() {
  local name="$1"
  if "$name"; then
    printf 'PASS: %s\n' "$name"
  else
    exit $?
  fi
}

run_test test_setup_preflights_before_mutating
run_test test_doctor_reports_missing_cargo
run_test test_completed_setup_is_a_noninteractive_noop
run_test test_force_recreates_a_completed_setup
run_test test_run_builds_before_launching
run_test test_patch_failure_is_resumable
run_test test_fully_applied_patch_stack_is_success
run_test test_help_is_an_explicit_command
