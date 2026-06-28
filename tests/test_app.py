import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

import jacktracker.services as svc
from jacktracker.config import config, parse_int_list


class DownloaderHelpersTest(unittest.TestCase):
    def test_spotify_fallback_target_sanitizes_query(self):
        target = svc.build_spotify_fallback_target("Artist && rm -rf /", "Track <script>")
        self.assertEqual(target, "ytsearch1:Artist rm -rf Track script audio")

    def test_rate_limit_pattern_matches_24_hour_limit(self):
        self.assertRegex("spotDL failed: 24 hour rate limit reached", config.rate_limit_pattern_str)

    def test_is_new_or_modified_audio_checks_audio_files_only(self):
        with TemporaryDirectory() as temp_dir:
            audio = Path(temp_dir) / "song.mp3"
            text = Path(temp_dir) / "notes.txt"
            audio.write_text("audio")
            text.write_text("not audio")

            self.assertTrue(svc.is_new_or_modified_audio(audio, {}, audio.stat().st_mtime))
            self.assertFalse(svc.is_new_or_modified_audio(text, {}, text.stat().st_mtime))

    def test_trim_error_output_keeps_start_and_end(self):
        output = "start" + ("x" * config.max_error_output_length) + "end"
        trimmed = svc.trim_error_output(output)
        self.assertIn("start", trimmed)
        self.assertIn("end", trimmed)
        self.assertIn("...", trimmed)

    def test_parse_int_list_empty(self):
        self.assertEqual(parse_int_list(None), ())
        self.assertEqual(parse_int_list(""), ())

    def test_parse_int_list_single(self):
        self.assertEqual(parse_int_list("123"), (123,))

    def test_parse_int_list_multiple(self):
        self.assertEqual(parse_int_list("123,456,789"), (123, 456, 789))

    def test_parse_int_list_with_spaces(self):
        self.assertEqual(parse_int_list(" 123 , 456 "), (123, 456))

    def test_parse_int_list_invalid_returns_empty(self):
        self.assertEqual(parse_int_list("abc"), ())

    def test_telegram_config_defaults(self):
        from jacktracker.config import Config
        c = Config()
        self.assertEqual(c.telegram_bot_token, "")
        self.assertEqual(c.telegram_allowed_chat_ids, ())

    def test_is_supported_url_valid(self):
        self.assertTrue(svc.is_supported_url("https://open.spotify.com/track/123"))
        self.assertTrue(svc.is_supported_url("http://youtube.com/watch?v=abc"))

    def test_is_supported_url_invalid(self):
        self.assertFalse(svc.is_supported_url(""))
        self.assertFalse(svc.is_supported_url("not-a-url"))
        self.assertFalse(svc.is_supported_url("ftp://example.com"))


if __name__ == "__main__":
    unittest.main()
