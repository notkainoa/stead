#!/bin/bash -eux

PLATFORM_ROOT="$(dirname "$(dirname "$(greadlink -f "${BASH_SOURCE[0]}")")")"
UNGOOGLED_REPO=$PLATFORM_ROOT/helium-chromium
PATCHES_DIR=$PLATFORM_ROOT/patches

_command=$1

restore_platform_series() {
    if [ ! -e "$PATCHES_DIR/series" ] && [ -f "$PATCHES_DIR/series.orig" ]; then
        cp "$PATCHES_DIR/series.orig" "$PATCHES_DIR/series"
    fi
}

# Helium's merge utility replaces the tracked series with series.merged. Keep
# the generated files for Quilt, but put the committed source back even when
# the merge fails or the shell receives a normal interrupt.
trap restore_platform_series EXIT
trap 'exit 1' HUP INT TERM

# Quilt reads series.merged, not series. If series gained new entries since
# the last merge, reusing the old merged file silently builds the old tree.
# Fail loudly instead so the caller regenerates before pushing or building.
# Returns 0 when series has entries missing from series.merged.
series_is_stale() {
    [ -f "$PATCHES_DIR/series" ] || return 1
    [ -f "$PATCHES_DIR/series.merged" ] || return 1
    local missing
    missing="$(awk 'NF && $1 !~ /^#/ { print $1 }' "$PATCHES_DIR/series" | while read -r patch; do
        if ! awk 'NF && $1 !~ /^#/ { print $1 }' "$PATCHES_DIR/series.merged" | grep -Fxq "$patch"; then
            printf '%s\n' "$patch"
        fi
    done)"
    [ -n "$missing" ]
}

if [ "$_command" = merge ] && [ -f "$PATCHES_DIR/series.merged" ]; then
    if series_is_stale; then
        echo "error: patches/series.merged is stale (patches/series has entries missing from it)." >&2
        echo "Run './st pop', './st unmerge', './st merge', then './st setup' to regenerate." >&2
        exit 1
    fi
    exit 0
fi

"$UNGOOGLED_REPO/devutils/update_platform_patches.py" "$_command" "$PATCHES_DIR"
