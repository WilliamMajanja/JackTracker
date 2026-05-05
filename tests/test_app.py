import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

import app


class DownloaderHelpersTest(unittest.TestCase):
    def test_spotify_fallback_target_sanitizes_query(self):
        target = app.build_spotify_fallback_target("Artist && rm -rf /", "Track <script>")
        self.assertEqual(target, "ytsearch1:Artist rm -rf Track script audio")

    def test_rate_limit_pattern_matches_24_hour_limit(self):
        self.assertRegex("spotDL failed: 24 hour rate limit reached", app.RATE_LIMIT_PATTERN)

    def test_is_new_or_modified_audio_checks_audio_files_only(self):
        with TemporaryDirectory() as temp_dir:
            audio = Path(temp_dir) / "song.mp3"
            text = Path(temp_dir) / "notes.txt"
            audio.write_text("audio")
            text.write_text("not audio")

            self.assertTrue(app.is_new_or_modified_audio(audio, {}, audio.stat().st_mtime))
            self.assertFalse(app.is_new_or_modified_audio(text, {}, text.stat().st_mtime))

    def test_trim_error_output_keeps_start_and_end(self):
        output = "start" + ("x" * app.MAX_ERROR_OUTPUT_LENGTH) + "end"
        trimmed = app.trim_error_output(output)
        self.assertIn("start", trimmed)
        self.assertIn("end", trimmed)
        self.assertIn("...", trimmed)


if __name__ == "__main__":
    unittest.main()
