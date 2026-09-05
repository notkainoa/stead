# Shared stale-state checker for the generated Quilt patch series.
#
# Quilt reads patches/series.merged, not the committed patches/series. When
# the two disagree, pushing or building silently uses the old tree, so every
# caller (setup, push, build, merge) must consult this single helper and fail
# loudly instead of reusing the stale file.
#
# This file is a sourced library, not an executable. It must stay compatible
# with both bash and zsh: dev.sh is sourced by the test suite under zsh.
#
# Usage: stead_patch_series_is_stale <patches-dir>
# Returns 0 when series.merged is stale and must be regenerated, 1 otherwise.
# Fails closed: missing or unreadable series state reports stale rather than
# silently accepting the generated file.
stead_patch_series_is_stale() {
    local patches_dir="$1"
    local series="$patches_dir/series"
    local merged="$patches_dir/series.merged"
    local prepend="$patches_dir/series.prepend"

    # No generated state: nothing to be stale against; the merge path runs.
    [ -f "$merged" ] || return 1
    # Without the committed source we cannot prove the generated file matches
    # it (deleted series, interrupted merge), so refuse to reuse it.
    [ -f "$series" ] || return 0

    # Capture each awk separately so a read failure fails closed instead of
    # being hidden by the exit status of the consuming loop.
    local series_entries merged_entries prepend_entries
    series_entries="$(awk 'NF && $1 !~ /^#/ { print $1 }' "$series")" || return 0
    merged_entries="$(awk 'NF && $1 !~ /^#/ { print $1 }' "$merged")" || return 0

    local patch
    # Direction 1: patches added to series that never made it into merged.
    while IFS= read -r patch; do
        [ -n "$patch" ] || continue
        if ! printf '%s\n' "$merged_entries" | grep -Fxq "$patch"; then
            return 0
        fi
    done <<< "$series_entries"

    # Direction 2: patches removed from series that still linger in merged.
    # Entries also listed in series.prepend are platform patches merged in
    # from helium-chromium, not removals, so exclude them while that record
    # exists. Without it we cannot tell platform entries apart, so only the
    # Stead-owned namespace (which the prepend never contributes) is checked.
    if [ -f "$prepend" ]; then
        prepend_entries="$(awk 'NF && $1 !~ /^#/ { print $1 }' "$prepend")" || return 0
    else
        prepend_entries=""
    fi
    while IFS= read -r patch; do
        [ -n "$patch" ] || continue
        if printf '%s\n' "$series_entries" | grep -Fxq "$patch"; then
            continue
        fi
        if [ -f "$prepend" ]; then
            if ! printf '%s\n' "$prepend_entries" | grep -Fxq "$patch"; then
                return 0
            fi
        else
            case "$patch" in
                stead/*) return 0;;
            esac
        fi
    done <<< "$merged_entries"

    return 1
}
