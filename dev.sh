#!/usr/bin/env bash

_dev_script="${BASH_SOURCE[0]:-$0}"
_root_dir="$(cd "$(dirname "$_dev_script")" && pwd -P)"

source "$_root_dir/env.sh"
source "$_root_dir/devutils/set_quilt_vars.sh"

_setup_marker="$_out_dir/.stead-setup-complete"
_presetup_marker="$_out_dir/.stead-presetup-complete"

___stead_has_command() {
    command -v "$1" >/dev/null 2>&1
}

___stead_python_is_supported() {
    python3 -c 'import sys; raise SystemExit(sys.version_info < (3, 13))' >/dev/null 2>&1
}

___stead_select_homebrew_python() {
    if ___stead_has_command python3 && ___stead_python_is_supported; then
        return
    fi
    if ! ___stead_has_command brew; then
        return
    fi

    local formula
    local prefix
    for formula in python python@3.14 python@3.13; do
        prefix="$(brew --prefix "$formula" 2>/dev/null)" || continue
        if [ -x "$prefix/libexec/bin/python3" ]; then
            PATH="$prefix/libexec/bin:$PATH"
            export PATH
            return
        fi
    done
}

___stead_python_has_module() {
    python3 -c "import $1" >/dev/null 2>&1
}

___stead_has_metal_toolchain() {
    xcrun -sdk macosx -f metal >/dev/null 2>&1
}

___stead_has_brew_formula() {
    brew list --versions "$1" >/dev/null 2>&1
}

___stead_xcode_is_supported() {
    local major
    major="$(xcodebuild -version 2>/dev/null | sed -n 's/^Xcode \([0-9][0-9]*\).*/\1/p')"
    [ -n "$major" ] && [ "$major" -ge 26 ]
}

___stead_macos_is_supported() {
    local major
    major="$(sw_vers -productVersion 2>/dev/null | cut -d. -f1)"
    [ -n "$major" ] && [ "$major" -ge 12 ]
}

___stead_select_homebrew_python

___stead_preflight() {
    local missing=0
    local python_modules_missing=0
    local python_install_command

    echo "Checking development prerequisites..."

    if ! ___stead_macos_is_supported; then
        echo "  missing: macOS 12 or newer"
        echo "           open 'x-apple.systempreferences:com.apple.Software-Update-Settings.extension'"
        missing=1
    fi

    if ! ___stead_has_command git; then
        echo "  missing: Git"
        echo "           xcode-select --install"
        missing=1
    fi

    if ! ___stead_has_command xcodebuild; then
        echo "  missing: Xcode"
        echo "           open 'macappstore://itunes.apple.com/app/id497799835'"
        missing=1
    elif ! ___stead_xcode_is_supported; then
        echo "  missing: Xcode 26 or newer"
        echo "           open 'macappstore://itunes.apple.com/app/id497799835'"
        missing=1
    fi

    if ! ___stead_has_command brew; then
        echo "  missing: Homebrew"
        echo '           /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
        missing=1
    fi

    if ! ___stead_has_command python3; then
        echo "  missing: Python 3"
        echo "           brew install python@3.13"
        missing=1
        python_modules_missing=1
    elif ! ___stead_python_is_supported; then
        echo "  missing: Python 3.13 or newer"
        echo "           brew install python@3.13"
        missing=1
        python_modules_missing=1
    else
        for module in httplib2 requests PIL; do
            if ! ___stead_python_has_module "$module"; then
                python_modules_missing=1
            fi
        done
    fi

    if [ "$python_modules_missing" -eq 1 ]; then
        if ___stead_has_command python3 && ___stead_python_is_supported; then
            python_install_command="$(command -v python3)"
        else
            python_install_command='"$(brew --prefix python@3.13)/libexec/bin/python3"'
        fi
        echo "  missing: Python build packages"
        echo "           $python_install_command -m pip install --break-system-packages httplib2==0.22.0 requests pillow"
        missing=1
    fi

    if ! ___stead_has_command ninja; then
        echo "  missing: Ninja"
        echo "           brew install ninja"
        missing=1
    fi

    if ! ___stead_has_command wget; then
        echo "  missing: wget"
        echo "           brew install wget"
        missing=1
    fi

    if ! ___stead_has_command greadlink; then
        echo "  missing: GNU coreutils"
        echo "           brew install coreutils"
        missing=1
    fi

    if ___stead_has_command brew && ! ___stead_has_brew_formula readline; then
        echo "  missing: readline"
        echo "           brew install readline"
        missing=1
    fi

    if ! ___stead_has_command quilt; then
        echo "  missing: Quilt"
        echo "           brew install quilt"
        missing=1
    fi

    if ! ___stead_has_command bun; then
        echo "  missing: Bun (used to build the sidebar UI)"
        echo "           curl -fsSL https://bun.sh/install | bash"
        missing=1
    fi

    if ! ___stead_has_command cargo; then
        echo "  missing: Rust/Cargo (used to build the Stead brain helper)"
        echo "           brew install rust"
        missing=1
    fi

    if ___stead_has_command xcodebuild && ! ___stead_has_metal_toolchain; then
        echo "  missing: Xcode Metal toolchain"
        echo "           xcodebuild -downloadComponent MetalToolchain"
        missing=1
    fi

    if [ "$missing" -ne 0 ]; then
        echo "Install the missing prerequisites, then rerun your command." >&2
        return 1
    fi

    echo "All development prerequisites are installed."
}

___stead_prepare_submodules() {
    if [ -f "$_main_repo/utils/generate_resources.py" ]; then
        return
    fi

    echo "Initializing Git submodules..."
    git -C "$_root_dir" submodule update --init --recursive
}

___stead_validate_patch_syntax() {
    python3 "$_root_dir/devutils/check_stead_patch_syntax.py"
}

___stead_sync_resources() {
    echo "Building the sidebar UI resources..."
    "$_root_dir/resources/stead/sync_sidebar_ui.sh"
}

___stead_setup_is_complete() {
    [ -f "$_setup_marker" ] || {
        # Recognize complete environments created before the marker existed.
        [ -f "$_out_dir/build.ninja" ] && [ -x "$_out_dir/gn" ]
    }
}

___stead_presetup_is_complete() {
    [ -f "$_presetup_marker" ] || {
        # Recognize a source tree prepared before stage markers existed.
        [ -f "$_src_dir/DEPS" ] &&
            [ -f "$_out_dir/args.gn" ] &&
            [ -f "$_depot_tools_dir/autoninja.py" ]
    }
}

___stead_patch_series_is_merged() {
    [ -f "$_root_dir/patches/series.merged" ]
}

# Returns 0 when patches/series lists entries missing from the generated
# patches/series.merged (Quilt's actual source of truth). A stale merged
# file makes setup report "already fully applied" while building the old
# tree, so callers must fail loudly instead of pushing or building.
___stead_patch_series_is_stale() {
    [ -f "$_root_dir/patches/series" ] || return 1
    [ -f "$_root_dir/patches/series.merged" ] || return 1
    local missing
    missing="$(awk 'NF && $1 !~ /^#/ { print $1 }' "$_root_dir/patches/series" | while read -r patch; do
        if ! awk 'NF && $1 !~ /^#/ { print $1 }' "$_root_dir/patches/series.merged" | grep -Fxq "$patch"; then
            printf '%s\n' "$patch"
        fi
    done)"
    [ -n "$missing" ]
}

___stead_patch_series_stale_message() {
    echo "patches/series.merged is stale: patches/series lists patches missing from it." >&2
    echo "Run './st pop', './st unmerge', './st merge', then './st setup' to regenerate." >&2
}

___stead_patch_stack_is_fully_applied() {
    local last_patch
    local top_patch
    last_patch="$(awk 'NF && $1 !~ /^#/ { last = $1 } END { print last }' \
        "$_root_dir/patches/series.merged")"
    top_patch="$(___stead_quilt top 2>/dev/null)" || return 1
    [ -n "$last_patch" ] && [ "$top_patch" = "$last_patch" ]
}

___stead_clean_incomplete_setup() {
    if [ ! -e "$_src_dir" ] && [ ! -e "$_root_dir/patches/series.merged" ]; then
        return
    fi

    if ___stead_setup_is_complete; then
        echo "Recreating the completed development setup from scratch."
    else
        echo "An incomplete development setup was found; restarting it cleanly."
    fi
    "$_root_dir/devutils/update_patches.sh" unmerge >/dev/null 2>&1 || true
    rm -rf "$_src_dir"
    rm -f "$_subs_cache" "$_namesubs_cache"
}

___stead_should_redo_setup() {
    if [ "${1-}" = "--force" ]; then
        return 0
    fi

    if [ -t 0 ] && [ -t 1 ]; then
        local answer
        printf "Development setup is already complete. Redo it from scratch? [y/N] "
        read -r answer
        case "$answer" in
            y|Y|yes|YES|Yes) return 0;;
            *) echo "Keeping the existing development setup."; return 1;;
        esac
    fi

    echo "Development setup is already complete; nothing to do."
    echo "Run './st setup --force' to recreate it."
    return 1
}

___stead_quilt() {
    command quilt --quiltrc - "$@"
}

___helium_setup_siso() {
    if [ -x "$_siso_path" ]; then
        return
    fi

    local siso_arch="mac-arm64"
    if [[ $_arch == "x86_64" ]]; then
        siso_arch="mac-amd64"
    fi

    local siso_package="build/siso/$siso_arch"

    local siso_version=$(sed -n "s/.*'siso_version': '\([^']*\)'.*/\1/p" "$_src_dir/DEPS" | head -1)
    if [ -z "$siso_version" ]; then
        echo "error: couldn't find siso_version in DEPS" >&2
        return 1
    fi

    mkdir -p "$_siso_dir"
    printf '%s\n' "$siso_package $siso_version" |
        "$_depot_tools_dir/cipd" ensure --root "$_siso_dir" --ensure-file -
}

___helium_setup_gn() {
    local OUT_FILE="$_out_dir/args.gn"
    cat "$_main_repo/flags.gn" "$_root_dir/flags.macos.gn" > "$OUT_FILE"

    if command -v sccache 2>&1 >/dev/null; then
        echo 'cc_wrapper="sccache"' >> "$OUT_FILE"
    elif command -v ccache 2>&1 >/dev/null; then
        echo 'cc_wrapper="env CCACHE_COMPILERCHECK=content CCACHE_SLOPPINESS=time_macros ccache"' >> "$OUT_FILE"
    else
        echo 'warn: sccache or ccache is not available' >&2
    fi

    local TARGET_CPU="arm64"
    if [[ $_arch == "x86_64" ]]; then
        TARGET_CPU="x64"
    fi

    echo 'target_cpu = "'"$TARGET_CPU"'"' >> "$OUT_FILE"
    echo 'devtools_skip_typecheck = false' >> "$OUT_FILE"
    echo 'use_siso = true' >> "$OUT_FILE"

    sed -i '' s/is_official_build/is_component_build/ "$OUT_FILE"
}

___helium_info_pull() {
    # fall back to git clone if tarball is unavailable
    "$_root_dir/retrieve_and_unpack_resource.sh" -d -g || \
      "$_root_dir/retrieve_and_unpack_resource.sh" -g

    mkdir -p "$_out_dir"
    cd "$_src_dir"
}

___helium_configure() {
    cd "$_src_dir"
    ___helium_setup_siso
    python3 ./tools/gn/bootstrap/bootstrap.py -o "$_out_dir/gn" --skip-generate-buildfiles
    "$_out_dir/gn" gen "$_out_dir" --fail-on-unused-args --export-compile-commands
}

___helium_toolchain() {
    "$_root_dir/retrieve_and_unpack_resource.sh" -t
}

___helium_resources() {
    python3 "$_main_repo/utils/generate_resources.py" "$_main_repo/resources/generate_resources.txt" "$_main_repo/resources"
    python3 "$_main_repo/utils/replace_resources.py" "$_root_dir/resources/platform_resources.txt" "$_root_dir/resources" "$_src_dir"
    python3 "$_main_repo/utils/replace_resources.py" "$_main_repo/resources/helium_resources.txt" "$_main_repo/resources" "$_src_dir"
    "$_root_dir/resources/stead/install_sidebar_to_tree.sh" "$_src_dir"
}

___helium_setup_presetup() {
    if [ -d "$_src_dir/out" ]; then
        echo "$_src_dir/out already exists" >&2
        return 1
    fi

    rm -rf "$_src_dir" && mkdir -p "$_download_cache" "$_src_dir"

    ___helium_info_pull
    python3 "$_main_repo/utils/prune_binaries.py" "$_src_dir" "$_main_repo/pruning.list"
    ___helium_toolchain
    ___helium_resources
    ___helium_setup_gn

    python3 "$_main_repo/utils/helium_version.py" \
        --tree "$_main_repo" \
        --platform-tree "$_root_dir" \
        --chromium-tree "$_src_dir"
}

___helium_setup() {
    local force="${1-}"
    local recreate=0

    if [ -n "$force" ] && [ "$force" != "--force" ]; then
        echo "usage: ./st setup [--force]" >&2
        return 2
    fi

    if ___stead_setup_is_complete; then
        if ! ___stead_should_redo_setup "$force"; then
            return 0
        fi
        recreate=1
    elif [ "$force" = "--force" ]; then
        recreate=1
    fi

    # Nothing below this point should run unless every external dependency is
    # available. This keeps a failed preflight safe to retry.
    ___stead_preflight
    ___stead_validate_patch_syntax
    ___stead_prepare_submodules
    ___stead_sync_resources

    if [ "$recreate" -eq 1 ]; then
        ___stead_clean_incomplete_setup
    elif ! ___stead_presetup_is_complete && [ -e "$_src_dir" ]; then
        # Failures during source preparation are not safely resumable because
        # pruning/toolchain/resource steps may only be partially complete.
        ___stead_clean_incomplete_setup
    fi

    if ___stead_presetup_is_complete; then
        echo "Prepared Chromium source tree found; resuming setup."
        touch "$_presetup_marker"
    else
        ___helium_setup_presetup
        touch "$_presetup_marker"
    fi

    if ___stead_patch_series_is_merged; then
        echo "Merged patch series found; resuming patch application."
        if [ ! -e "$_root_dir/patches/series" ] &&
            [ -f "$_root_dir/patches/series.orig" ]; then
            # Repair generated state left by the old destructive merge flow.
            cp "$_root_dir/patches/series.orig" "$_root_dir/patches/series"
        fi
        if ___stead_patch_series_is_stale; then
            ___stead_patch_series_stale_message
            return 1
        fi
    else
        "$_root_dir/devutils/update_patches.sh" merge
    fi

    cd "$_src_dir"
    if ___stead_patch_stack_is_fully_applied; then
        echo "Patch stack is already fully applied."
    elif ! ___stead_quilt push -a; then
        echo >&2
        echo "Stead's patch stack does not apply to the prepared Chromium tree." >&2
        echo "This is usually a repository patch bug, not a problem with your machine." >&2
        echo "The prepared source tree has been preserved." >&2
        echo "After updating the repository or fixing the patch, rerun './st setup' to resume." >&2
        echo "Use './st setup --force' only if you want to recreate everything." >&2
        return 1
    fi

    ___helium_configure
    touch "$_setup_marker"
    echo "Development setup is ready. Run './st run' to build and launch Stead."
}

___helium_reset() {
    "$_root_dir/devutils/update_patches.sh" unmerge || true
    rm "$_subs_cache" || true
    rm "$_namesubs_cache" || true
    if mv "$_src_dir" "${_src_dir}x"; then
        rm -rf "${_src_dir}x" &
    fi
}

___helium_name_substitution() {
    if [ "$1" = "nameunsub" ]; then
        python3 "$_root_dir/devutils/stead_name_substitution.py" --unsub \
            -t "$_src_dir" --backup-path "$_namesubs_cache"
        python3 "$_root_dir/devutils/stead_protocol_substitution.py" \
            -t "$_src_dir" --revert
    elif [ "$1" = "namesub" ]; then
        if [ -f "$_namesubs_cache" ]; then
            echo "$_namesubs_cache exists, are you sure you want to do this?" >&2
            echo "if yes, then delete the $_namesubs_cache file" >&2
            return
        fi

        python3 "$_root_dir/devutils/stead_name_substitution.py" --sub \
            -t "$_src_dir" --backup-path "$_namesubs_cache"
        python3 "$_root_dir/devutils/stead_protocol_substitution.py" \
            -t "$_src_dir"
    else
        echo "unknown action: $1" >&2
        return
    fi
}

___helium_apply_translations() {
    python3 "$_main_repo/utils/i18n_apply.py" -t "$_src_dir"
}

___helium_generate_translations() {
    python3 "$_main_repo/devutils/i18n.py" generate
}

___helium_substitution() {
    if [ "$1" = "unsub" ]; then
        python3 "$_main_repo/utils/domain_substitution.py" revert \
            -c "$_subs_cache" "$_src_dir"

        ___helium_name_substitution nameunsub
    elif [ "$1" = "sub" ]; then
        if [ -f "$_subs_cache" ]; then
            echo "$_subs_cache exists, are you sure you want to do this?" >&2
            echo "if yes, then delete the $_subs_cache file" >&2
            return
        fi

        ___helium_name_substitution namesub

        python3 "$_main_repo/utils/domain_substitution.py" apply \
            -r "$_main_repo/domain_regex.list" \
            -f "$_main_repo/domain_substitution.list" \
            -c "$_subs_cache" \
            "$_src_dir"
    else
        echo "unknown action: $1" >&2
        return
    fi
}

___helium_build() {
    if ! ___stead_setup_is_complete; then
        echo "Development setup is incomplete. Run './st setup' first." >&2
        return 1
    fi

    # A completed source setup can outlive newly added build prerequisites.
    # Recheck before touching generated resources so the failure stays clear
    # and safe to retry.
    ___stead_preflight

    # A new patch added after setup leaves a stale series.merged behind.
    # Building now would silently compile the old tree.
    if ___stead_patch_series_is_stale; then
        ___stead_patch_series_stale_message
        return 1
    fi

    # Keep generated WebUI assets and the Chromium resource tree in sync so a
    # normal build never depends on a separate resources command.
    ___stead_sync_resources
    ___helium_resources

    cd "$_src_dir"
    SISO_PATH="$_siso_path" python3 "$_depot_tools_dir/autoninja.py" \
    -k 0 -C "$_out_dir" chrome chromedriver

    "$_root_dir/resources/stead/install_brain_helper.sh" \
        "$_out_dir/Stead.app"
}

___helium_launch() {
    if [ ! -x "$_out_dir/Stead.app/Contents/MacOS/Stead" ]; then
        echo "No development binary was found. Run './st run' to build it first." >&2
        return 1
    fi

    "$_out_dir/Stead.app/Contents/MacOS/Stead" \
    --user-data-dir="$HOME/Library/Application Support/com.steadbrowser.app.dev" \
    --enable-ui-devtools \
    --use-mock-keychain \
    --disable-features=DialMediaRouteProvider
}

___helium_run() {
    if [ -n "${1-}" ] && [ "$1" != "--no-build" ]; then
        echo "usage: ./st run [--no-build]" >&2
        return 2
    fi

    if [ "${1-}" != "--no-build" ]; then
        ___helium_build
    fi
    ___helium_launch
}

___helium_pull() {
    if [ -f "$_subs_cache" ]; then
        echo "source files are substituted, please run './st unsub' first" >&2
        return 1
    fi

    cd "$_src_dir" && ___stead_quilt pop -a || true
    "$_root_dir/devutils/update_patches.sh" unmerge || true

    for dir in "$_root_dir" "$_main_repo"; do
        git -C "$dir" stash \
        && git -C "$dir" fetch \
        && git -C "$dir" rebase origin/main \
        && git -C "$dir" stash pop \
        || true
    done

    "$_root_dir/devutils/update_patches.sh" merge
    cd "$_src_dir" && ___stead_quilt push -a --refresh
}

___helium_patches_merge() {
    "$_root_dir/devutils/update_patches.sh" merge
}

___helium_patches_unmerge() {
    "$_root_dir/devutils/update_patches.sh" unmerge
}

___helium_quilt_push() {
    if ___stead_patch_series_is_stale; then
        ___stead_patch_series_stale_message
        return 1
    fi
    cd "$_src_dir" && ___stead_quilt push -a --refresh
}

___helium_quilt_pop() {
    cd "$_src_dir" && ___stead_quilt pop -a
}

___helium_validate() {
    if [ "$1" = "config" ]; then
        python3 "$_main_repo/devutils/validate_config.py"
    elif [ "$1" = "patches" ]; then
        if [ ! -f "patches/series.merged" ]; then
            echo "patches/series.merged doesn't exist. did you forget to merge?" >&2
            return 1
        fi
        python3 "$_main_repo/devutils/validate_patches.py" \
            -l "$_src_dir" \
            -s patches/series.merged
    elif [ "$1" = "series" ]; then
        "$_root_dir/devutils/check_patch_files.sh"
    else
        echo "unknown validate action. usage: ./st validate <config|patches|series>" >&2
    fi
}

___helium_format() {
    cd "$_src_dir"
    ___stead_quilt diff | "$_src_dir/third_party/clang-format/script/clang-format-diff.py" \
    -p1 -i -style=file
}

___helium_find_tidy_diff() {
    if [ -n "$_tidy_diff_script" ]; then
        return
    elif command -v clang-tidy-diff >/dev/null 2>&1; then
        _tidy_diff_script=$(command -v clang-tidy-diff)
    elif command -v clang-tidy-diff.py >/dev/null 2>&1; then
        _tidy_diff_script=$(command -v clang-tidy-diff.py)
    else
        _tidy_diff_script=$(find /opt/homebrew/Cellar/llvm -name clang-tidy-diff.py | head -1)
    fi

    if [ -z "$_tidy_diff_script" ]; then
        echo "could not find clang-tidy-diff.py script." >&2
        echo "ensure that you have llvm installed on your system" >&2
        return 1
    fi
}

___helium_strip_compile_commands() {
    _ccmd_path="$_out_dir/compile_commands.json"
    [ "$_ccmd_stripped" = 1 ] && return;
    _ccmd_stripped=1

    echo "normalizing compile_commands.json, this will take a while..."
    cp "$_ccmd_path" "$_ccmd_path.orig";
    gsed -Ei 's/^(\s*"command": ").*?\s(\S+bin\/clang)/\1\2/g' "$_ccmd_path"
}

___helium_tidy() {
    ___helium_find_tidy_diff || return;
    ___helium_strip_compile_commands;
    ___stead_quilt diff | "$_tidy_diff_script" \
        -regex '.*\.(cc|mm)' \
        -use-color \
        -p1 \
        -path "$_out_dir" \
        -quiet \
        -j$(nproc)
}

___helium_lint() {
    ___helium_format;
    ___helium_tidy;
}

___stead_help() {
    cat >&2 <<'EOF'
usage: st <command>

  setup [--force]  Check prerequisites and prepare the full dev environment
  doctor           Check prerequisites without changing anything
  build            Refresh resources and compile without launching
  run [--no-build] Build and launch Stead (or launch the existing binary)
  help              Show this help

Patch and source tools:
  presetup          Download sources and prepare third-party dependencies
  configure         Generate the build configuration and tools
  resources         Generate and copy Stead resources
  sub | unsub       Apply or undo domain and name substitutions
  namesub | nameunsub
                    Apply or undo name substitutions only
  translate         Apply translations
  transgen          Generate translation source strings
  merge | unmerge   Merge or unmerge the platform patch series
  push | pop        Apply or undo all Quilt patches
  pull              Pop patches, pull repositories, and reapply patches
  validate <config|patches|series>
                    Validate build configuration or patch state
  format | tidy | lint
                    Check or fix the topmost patch
  reset             Remove the development source tree

From a repository checkout, invoke this command as `./st`.
EOF
}

__stead_menu() {
    set -e
    case ${1-} in
        ""|help) ___stead_help;;
        setup) ___helium_setup "${2-}";;
        doctor) ___stead_preflight;;
        presetup) ___helium_setup_presetup;;
        configure) ___helium_configure;;
        resources) ___helium_resources;;

        sub|unsub) ___helium_substitution "$1";;
        namesub|nameunsub) ___helium_name_substitution "$1";;
        translate) ___helium_apply_translations;;
        transgen) ___helium_generate_translations;;

        merge) ___helium_patches_merge;;
        unmerge) ___helium_patches_unmerge;;
        push) ___helium_quilt_push;;
        pop) ___helium_quilt_pop;;
        pull) ___helium_pull;;

        validate) ___helium_validate "${2-}";;
        format) ___helium_format;;
        tidy) ___helium_tidy;;
        lint) ___helium_lint;;

        build) ___helium_build;;
        run) ___helium_run "${2-}";;
        reset) ___helium_reset;;
        *)
            echo "Unknown command: $1" >&2
            ___stead_help
            return 2
    esac
}

if ! (return 0 2>/dev/null); then
    echo "dev.sh is internal. Run './st help'." >&2
    exit 2
fi
