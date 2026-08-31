#!/usr/bin/env python3

# Copyright 2026 The Stead Authors
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

"""Reject malformed Stead patches without requiring a Chromium source tree."""

import re
import subprocess
import sys
from pathlib import Path
from typing import Optional


HUNK_HEADER = re.compile(
    r"^@@ -(?:\d+)(?:,(\d+))? \+(?:\d+)(?:,(\d+))? @@"
)


def validate_hunk_counts(patch_text: str) -> Optional[str]:
    lines = patch_text.splitlines()
    for index, line in enumerate(lines):
        match = HUNK_HEADER.match(line)
        if not match:
            continue

        expected_old = int(match.group(1) or 1)
        expected_new = int(match.group(2) or 1)
        actual_old = 0
        actual_new = 0
        cursor = index + 1
        while cursor < len(lines):
            body_line = lines[cursor]
            is_file_header = (
                body_line.startswith("--- ")
                and cursor + 1 < len(lines)
                and lines[cursor + 1].startswith("+++ ")
            )
            if (
                body_line.startswith("@@ ")
                or body_line.startswith("diff --git ")
                or body_line.startswith("Index: ")
                or is_file_header
            ):
                break
            if not body_line:
                if (actual_old, actual_new) != (expected_old, expected_new):
                    actual_old += 1
                    actual_new += 1
                cursor += 1
                continue
            if body_line.startswith("\\"):
                cursor += 1
                continue
            if body_line[0] not in " +-":
                return f"invalid hunk line {cursor + 1}"
            if body_line[0] != "+":
                actual_old += 1
            if body_line[0] != "-":
                actual_new += 1
            cursor += 1

        if (actual_old, actual_new) != (expected_old, expected_new):
            return (
                f"hunk line {index + 1} declares old={expected_old}, "
                f"new={expected_new}, but contains old={actual_old}, "
                f"new={actual_new}"
            )
    return None


def main() -> int:
    repo_root = (
        Path(sys.argv[1]).resolve()
        if len(sys.argv) > 1
        else Path(__file__).resolve().parents[1]
    )
    patches_dir = repo_root / "patches"
    series_file = patches_dir / "series.merged"
    if not series_file.is_file():
        series_file = patches_dir / "series"
    if not series_file.is_file():
        print("No active patch series was found.", file=sys.stderr)
        return 1

    checked = 0
    for raw_line in series_file.read_text(encoding="utf-8").splitlines():
        patch_name = raw_line.strip()
        if not patch_name.startswith("stead/"):
            continue

        patch_file = patches_dir / patch_name
        if not patch_file.is_file():
            print(f"Stead patch is missing: {patch_name}", file=sys.stderr)
            return 1

        patch_text = patch_file.read_text(encoding="utf-8")
        count_error = validate_hunk_counts(patch_text)
        if count_error:
            print(f"Malformed Stead patch: {patch_name}", file=sys.stderr)
            print(count_error, file=sys.stderr)
            return 1

        result = subprocess.run(
            ["git", "apply", "--numstat", str(patch_file)],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            print(f"Malformed Stead patch: {patch_name}", file=sys.stderr)
            print(result.stderr.rstrip(), file=sys.stderr)
            return 1
        checked += 1

    print(f"Validated {checked} Stead patches.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
