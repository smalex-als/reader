from pathlib import Path
import tempfile
import unittest

from sync_subtitles_mfa.srt import Cue, cues_from_words, format_timestamp, join_words, merge_short_cues, wrap_words, write_srt
from sync_subtitles_mfa.textgrid import Word


class SRTTest(unittest.TestCase):
    def test_short_unfinished_cues_merge_across_pause(self) -> None:
        words = [
            Word(0.0, 0.2, "This"),
            Word(0.25, 0.5, "is"),
            Word(0.55, 0.8, "the"),
            Word(0.85, 1.1, "first"),
            Word(2.0, 2.2, "Next"),
            Word(2.25, 2.5, "cue"),
        ]

        cues = cues_from_words(words, max_words_per_cue=4, max_cue_duration=4.0, pause_threshold=0.6)

        self.assertEqual(len(cues), 1)
        self.assertEqual(cues[0].text, "This is the first Next cue")

        with tempfile.TemporaryDirectory() as temp_dir:
            out = Path(temp_dir) / "out.srt"
            write_srt(cues, out)
            self.assertTrue(out.read_text(encoding="utf-8").startswith("1\n00:00:00,000 --> 00:00:02,500"))

    def test_format_timestamp_rounds_to_srt_milliseconds(self) -> None:
        self.assertEqual(format_timestamp(3661.2345), "01:01:01,234")

    def test_join_words_recombines_hyphenated_source_tokens(self) -> None:
        self.assertEqual(join_words(["correctness-", "sensitive", "system."]), "correctness-sensitive system.")

    def test_abbreviation_does_not_end_sentence(self) -> None:
        words = [
            Word(0.0, 0.2, "I"),
            Word(0.2, 0.4, "like"),
            Word(0.4, 0.6, "you,"),
            Word(0.6, 1.0, "Mr."),
            Word(1.0, 1.3, "Godall,"),
            Word(1.3, 1.6, "returned"),
            Word(1.6, 1.8, "the"),
            Word(1.8, 2.1, "young"),
            Word(2.1, 2.4, "man;"),
        ]

        cues = cues_from_words(
            words,
            max_words_per_cue=40,
            max_cue_duration=20,
            pause_threshold=0.6,
            sentence_mode="strict",
        )

        self.assertEqual([cue.text for cue in cues], ["I like you, Mr. Godall, returned the young man;"])

    def test_strict_sentence_mode_keeps_sentence_together(self) -> None:
        words = [
            Word(0.0, 0.1, "This"),
            Word(0.1, 0.2, "sentence"),
            Word(0.2, 0.3, "stays"),
            Word(0.3, 0.4, "together."),
            Word(0.5, 0.6, "Next"),
            Word(0.6, 0.7, "one."),
        ]

        cues = cues_from_words(
            words,
            max_words_per_cue=2,
            max_cue_duration=0.2,
            pause_threshold=0.6,
            sentence_mode="strict",
        )

        self.assertEqual([cue.text for cue in cues], ["This sentence stays together. Next one."])

    def test_merges_short_cue_runs(self) -> None:
        cues = merge_short_cues(
            [
                Cue(1.0, 2.0, "You are not fooling me?"),
                Cue(2.2, 3.0, "he asked."),
                Cue(4.0, 5.0, "Ruined?"),
                Cue(5.2, 6.0, "said the young man."),
                Cue(7.0, 8.0, "You are the men for me!"),
                Cue(8.2, 9.0, "he cried, with an almost terrible gaiety."),
            ]
        )

        self.assertEqual(
            [cue.text for cue in cues],
            [
                "You are not fooling me? he asked.",
                "Ruined? said the young man.",
                "You are the men for me! he cried, with an almost terrible gaiety.",
            ],
        )

    def test_short_cue_run_does_not_attach_to_previous_normal_cue(self) -> None:
        cues = merge_short_cues(
            [
                Cue(14.41, 18.18, "Unhappy man, he cried, you should not have burned them all!"),
                Cue(18.5, 20.27, "You should have kept forty pounds."),
                Cue(20.6, 21.74, "Forty pounds!"),
                Cue(22.07, 23.08, "repeated the Prince."),
                Cue(23.79, 26.38, "Why, in heaven’s name, forty pounds?"),
            ]
        )

        self.assertEqual(
            [cue.text for cue in cues],
            [
                "Unhappy man, he cried, you should not have burned them all!",
                "You should have kept forty pounds. Forty pounds! repeated the Prince.",
                "Why, in heaven’s name, forty pounds?",
            ],
        )

    def test_incomplete_cue_merges_short_continuation_without_considering_gap(self) -> None:
        cues = merge_short_cues(
            [
                Cue(610.88, 613.43, "A ruined man, yes, returned the other suspiciously,"),
                Cue(615.06, 615.99, "or else a millionaire.."),
            ]
        )

        self.assertEqual(
            [cue.text for cue in cues],
            ["A ruined man, yes, returned the other suspiciously, or else a millionaire.."],
        )

    def test_abbreviation_keeps_original_phrase_together(self) -> None:
        words = [
            Word(417.94, 418.2, "I"),
            Word(418.2, 418.5, "like"),
            Word(418.5, 418.8, "you,"),
            Word(418.8, 421.37, "Mr."),
            Word(421.37, 421.8, "Godall,"),
            Word(421.8, 422.1, "returned"),
            Word(422.1, 422.4, "the"),
            Word(422.4, 422.8, "young"),
            Word(422.8, 423.1, "man;"),
            Word(423.1, 423.4, "you"),
            Word(423.4, 423.7, "inspire"),
            Word(423.7, 424.0, "me"),
            Word(424.0, 424.3, "with"),
            Word(424.3, 424.6, "a"),
            Word(424.6, 425.0, "natural"),
            Word(425.0, 425.4, "confidence;"),
        ]

        cues = cues_from_words(
            words,
            max_words_per_cue=40,
            max_cue_duration=20,
            max_line_chars=200,
            pause_threshold=0.6,
            sentence_mode="strict",
        )

        self.assertEqual(
            [cue.text for cue in cues],
            ["I like you, Mr. Godall, returned the young man; you inspire me with a natural confidence;"],
        )

    def test_wrap_words_uses_multiple_lines_for_long_sentences(self) -> None:
        lines = wrap_words(["one", "two", "three", "four", "five"], max_line_chars=13)

        self.assertEqual(lines, ["one two three", "four five"])

    def test_cues_respect_configured_line_width(self) -> None:
        words = [
            Word(0.0, 0.1, "one"),
            Word(0.1, 0.2, "two"),
            Word(0.2, 0.3, "three"),
            Word(0.3, 0.4, "four"),
            Word(0.4, 0.5, "five"),
        ]

        narrow = cues_from_words(words, max_line_chars=13)[0]
        wide = cues_from_words(words, max_line_chars=100)[0]

        self.assertEqual(narrow.text, "one two three\nfour five")
        self.assertEqual(wide.text, "one two three four five")


if __name__ == "__main__":
    unittest.main()
