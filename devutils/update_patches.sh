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

# shellcheck source=patch_series_stale.sh
source "$(dirname "$(greadlink -f "${BASH_SOURCE[0]}")")/patch_series_stale.sh"

# Quilt reads series.merged, not series. If the two disagree since the last
# merge, reusing the old merged file silently builds the old tree. Fail
# loudly instead so the caller regenerates before pushing or building.
if [ "$_command" = merge ] && [ -f "$PATCHES_DIR/series.merged" ]; then
    if stead_patch_series_is_stale "$PATCHES_DIR"; then
        echo "error: patches/series.merged is stale: it no longer matches patches/series." >&2
        echo "Run './st pop', './st unmerge', './st merge', then './st setup' to regenerate." >&2
        exit 1
    fi
    exit 0
fi

"$UNGOOGLED_REPO/devutils/update_platform_patches.py" "$_command" "$PATCHES_DIR"
