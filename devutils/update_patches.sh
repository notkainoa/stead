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

if [ "$_command" = merge ] && [ -f "$PATCHES_DIR/series.merged" ]; then
    exit 0
fi

"$UNGOOGLED_REPO/devutils/update_platform_patches.py" "$_command" "$PATCHES_DIR"
