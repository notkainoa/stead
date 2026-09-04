import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
PATCH_DIR = REPO_ROOT / "patches/stead/command-palette"


def read(name: str) -> str:
    return (PATCH_DIR / name).read_text(encoding="utf-8")


class SteadCommandPaletteTest(unittest.TestCase):
    def test_patches_are_in_series_in_dependency_order(self):
        series = (REPO_ROOT / "patches/series").read_text(encoding="utf-8")
        names = [
            "stead/command-palette/command-palette-files.patch",
            "stead/command-palette/register-command-palette.patch",
            "stead/command-palette/command-palette-on-new-tab-setting.patch",
        ]
        positions = [series.index(name) for name in names]
        self.assertEqual(positions, sorted(positions))
        # Depends on the newtab registration anchors it stacks on.
        self.assertLess(
            series.index("stead/newtab/register-stead-newtab.patch"), positions[0]
        )

    def test_new_tab_command_routes_to_palette_only_when_pref_is_set(self):
        text = read("command-palette-on-new-tab-setting.patch")

        self.assertIn(
            "+      if (profile()->GetPrefs()->GetBoolean(\n"
            "+              prefs::kSteadCommandPaletteOnNewTab)) {\n"
            "+        if (auto* palette = SteadCommandPaletteBubbleHost::From(browser_)) {\n"
            "+          palette->Toggle();\n"
            "+          break;\n"
            "+        }\n"
            "+      }\n"
            "       NewTab(browser_);",
            text,
        )
        # Off by default so Helium's Cmd+T behaviour is preserved.
        self.assertIn(
            "RegisterBooleanPref(prefs::kSteadCommandPaletteOnNewTab, false)", text
        )
        self.assertIn(
            '"stead.browser.command_palette_on_new_tab"', text
        )

    def test_setting_is_exposed_in_behavior_settings(self):
        text = read("command-palette-on-new-tab-setting.patch")

        self.assertIn(
            "(*s_allowlist)[::prefs::kSteadCommandPaletteOnNewTab]", text
        )
        self.assertIn(
            'pref="{{prefs.stead.browser.command_palette_on_new_tab}}"', text
        )
        self.assertIn(
            '{"commandPaletteOnNewTab", IDS_SETTINGS_COMMAND_PALETTE_ON_NEW_TAB}',
            text,
        )
        self.assertIn("IDS_SETTINGS_COMMAND_PALETTE_ON_NEW_TAB", text)

    def test_palette_is_a_top_chrome_webui_with_metrics_variant(self):
        files = read("command-palette-files.patch")
        register = read("register-command-palette.patch")

        self.assertIn('return "SteadCommandPalette";', files)
        self.assertIn('<variant name=".SteadCommandPalette"/>', register)
        self.assertIn('"command-palette.top-chrome"', register)
        self.assertIn("SteadCommandPaletteUIConfig", register)
        self.assertIn("ShouldAutoResizeHost() override", files)

    def test_bubble_host_is_owned_per_window_and_torn_down(self):
        register = read("register-command-palette.patch")

        self.assertIn(
            "CreateInstance<SteadCommandPaletteBubbleHost>(\n"
            "+            *browser_, browser_.get(), browser_view);",
            register,
        )
        self.assertIn("+  stead_command_palette_bubble_host_.reset();", register)

    def test_palette_ui_uses_chrome_send_messages_from_the_bridge(self):
        files = read("command-palette-files.patch")
        bridge = (REPO_ROOT / "ui/src/lib/palette.ts").read_text(encoding="utf-8")

        for message in (
            "steadPaletteReady",
            "steadPaletteClose",
            "steadPaletteSearch",
            "steadPaletteOpen",
        ):
            self.assertIn(f'"{message}"', files)
            self.assertIn(f"'{message}'", bridge)
        self.assertIn('"steadPaletteResults"', files)
        self.assertIn("steadPaletteResults", bridge)
        self.assertIn('"steadPaletteReset"', files)

    def test_committed_bundle_contains_the_palette_route(self):
        nodes = REPO_ROOT / "resources/stead/sidebar/_app/immutable/nodes"
        text = "".join(p.read_text(encoding="utf-8") for p in nodes.glob("*.js"))
        self.assertIn("steadPaletteSearch", text)


if __name__ == "__main__":
    unittest.main()
