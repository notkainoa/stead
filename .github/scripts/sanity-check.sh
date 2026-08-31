#!/bin/bash
set -exo pipefail

sudo mdutil -a -i off

brew install bun coreutils llvm@20 ninja python@3.14 quilt readline rust wget --overwrite
brew unlink python || true
brew link python@3.14 llvm@20 --force

pip3.14 install httplib2==0.22.0 requests Pillow --break

./st reset
./st setup | tee setup.log

if [ "$1" = "sub" ]; then
    ./st sub

    cd build/src
    cat components/omnibox_strings.grdp | grep -q Stead
    exit 0
fi

set +e
if grep -q 'offset .* lines' setup.log; then
    grep -A20 -B20 'offset .* lines' setup.log >&2
    exit 1
fi

# Patch application only proves that the text hunks matched. Compile the full
# browser so malformed-but-applicable patches and SDK compatibility regressions
# cannot reach developers. The former 30-second smoke build treated a timeout
# as success and therefore missed errors that appeared late in Chromium's graph.
set -e
./st build

# Compilation cannot detect late KeyedService registration, duplicate WebUI
# brokers, or DCHECKs during first paint. A healthy development build should
# remain alive until this intentional timeout.
_startup_dir="$(mktemp -d /tmp/stead-startup-smoke.XXXXXX)"
_startup_log="$_startup_dir/stderr.log"
set +e
gtimeout 10 build/src/out/Default/Stead.app/Contents/MacOS/Stead \
    --user-data-dir="$_startup_dir/profile" \
    --no-first-run \
    --use-mock-keychain \
    --disable-features=DialMediaRouteProvider \
    --enable-logging=stderr >"$_startup_log" 2>&1
_startup_status=$?
set -e

if [ "$_startup_status" -ne 124 ]; then
    echo "Stead exited during the startup smoke test (status $_startup_status)." >&2
    cat "$_startup_log" >&2
    exit 1
fi

if grep -Eq 'FATAL|DCHECK failed|Check failed' "$_startup_log"; then
    echo "Stead logged a fatal startup assertion." >&2
    cat "$_startup_log" >&2
    exit 1
fi

rm -r "$_startup_dir"
