import unittest

from sync_subtitles_mfa.textgrid import Word
from sync_subtitles_mfa.transcript import align_words_to_transcript, tokenize_transcript, transcript_text_for_alignment


class TranscriptTest(unittest.TestCase):
    def test_align_words_preserves_source_case_and_punctuation(self) -> None:
        words = [
            Word(0.0, 0.2, "we're"),
            Word(0.2, 0.4, "building"),
            Word(0.4, 0.6, "system"),
            Word(0.6, 0.8, "right"),
        ]

        aligned = align_words_to_transcript(words, "We’re building system, right?")

        self.assertEqual([word.text for word in aligned], ["We’re", "building", "system,", "right?"])

    def test_tokenize_splits_hyphenated_words_for_mfa_tokens(self) -> None:
        tokens = tokenize_transcript("correctness-sensitive end-to-end")

        self.assertEqual([token.surface for token in tokens], ["correctness-", "sensitive", "end-", "to-", "end"])
        self.assertEqual([token.key for token in tokens], ["correctness", "sensitive", "end", "to", "end"])

    def test_align_words_preserves_cyrillic_source_text(self) -> None:
        words = [
            Word(0.0, 0.2, "привет"),
            Word(0.2, 0.4, "мир"),
            Word(0.4, 0.6, "это"),
            Word(0.6, 0.8, "тест"),
        ]

        aligned = align_words_to_transcript(words, "Привет, мир! Это тест.")

        self.assertEqual([word.text for word in aligned], ["Привет,", "мир!", "Это", "тест."])

    def test_transcript_text_for_alignment_removes_markdown_and_punctuation(self) -> None:
        text = "# ЗАГОЛОВОК\n\n- Сильная, гибкая мышца лучше выдерживает нагрузку."

        self.assertEqual(
            transcript_text_for_alignment(text),
            "ЗАГОЛОВОК Сильная гибкая мышца лучше выдерживает нагрузку",
        )


if __name__ == "__main__":
    unittest.main()
