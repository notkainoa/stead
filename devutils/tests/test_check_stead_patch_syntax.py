import subprocess
import tempfile
import unittest
from pathlib import Path


class CheckSteadPatchSyntaxTest(unittest.TestCase):
    def setUp(self):
        self.repo_root = Path(__file__).resolve().parents[2]
        self.script = self.repo_root / "devutils/check_stead_patch_syntax.py"

    def run_check(self, patch_text: str):
        with tempfile.TemporaryDirectory() as tmpdirname:
            fixture_root = Path(tmpdirname)
            patch_dir = fixture_root / "patches/stead/test"
            patch_dir.mkdir(parents=True)
            (fixture_root / "patches/series").write_text(
                "stead/test/example.patch\n", encoding="utf-8"
            )
            (patch_dir / "example.patch").write_text(
                patch_text, encoding="utf-8"
            )
            return subprocess.run(
                ["python3", str(self.script), str(fixture_root)],
                capture_output=True,
                text=True,
            )

    def test_accepts_valid_patch(self):
        result = self.run_check(
            """diff --git a/example.txt b/example.txt
--- a/example.txt
+++ b/example.txt
@@ -1 +1 @@
-before
+after
"""
        )

        self.assertEqual(0, result.returncode, result.stderr)
        self.assertIn("Validated 1 Stead patches.", result.stdout)

    def test_rejects_malformed_hunk_counts(self):
        result = self.run_check(
            """diff --git a/example.txt b/example.txt
--- a/example.txt
+++ b/example.txt
@@ -1,2 +1,2 @@
-before
+after
"""
        )

        self.assertNotEqual(0, result.returncode)
        self.assertIn("Malformed Stead patch", result.stderr)

    def test_rejects_lines_beyond_declared_hunk_length(self):
        result = self.run_check(
            """diff --git a/example.txt b/example.txt
--- a/example.txt
+++ b/example.txt
@@ -1 +1 @@
-before
+after
+unaccounted
"""
        )

        self.assertNotEqual(0, result.returncode)
        self.assertIn("declares old=1, new=1", result.stderr)
        self.assertIn("contains old=1, new=2", result.stderr)


if __name__ == "__main__":
    unittest.main()
