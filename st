#!/usr/bin/env bash

set -e

stead_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"

# shellcheck source=dev.sh
source "$stead_root/dev.sh"

(__stead_menu "$@")
