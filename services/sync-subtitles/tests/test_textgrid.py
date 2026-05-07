from pathlib import Path
import tempfile
import unittest

from sync_subtitles_mfa.textgrid import Word, parse_words_tier


class TextGridTest(unittest.TestCase):
    def test_parse_long_textgrid_words_tier(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            textgrid = Path(temp_dir) / "sample.TextGrid"
            textgrid.write_text(
                '''
File type = "ooTextFile"
Object class = "TextGrid"

item []:
    item [1]:
        class = "IntervalTier"
        name = "phones"
        xmin = 0
        xmax = 1
        intervals: size = 1
        intervals [1]:
            xmin = 0
            xmax = 1
            text = "sil"
    item [2]:
        class = "IntervalTier"
        name = "words"
        xmin = 0
        xmax = 2
        intervals: size = 3
        intervals [1]:
            xmin = 0.0
            xmax = 0.25
            text = ""
        intervals [2]:
            xmin = 0.25
            xmax = 0.9
            text = "Hello"
        intervals [3]:
            xmin = 0.9
            xmax = 1.4
            text = "world"
''',
                encoding="utf-8",
            )

            self.assertEqual(parse_words_tier(textgrid), [Word(0.25, 0.9, "Hello"), Word(0.9, 1.4, "world")])

    def test_parse_short_textgrid_words_tier(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            textgrid = Path(temp_dir) / "sample.TextGrid"
            textgrid.write_text(
                '''
File type = "ooTextFile"
Object class = "TextGrid"

0
2
<exists>
1
"IntervalTier"
"words"
0
2
3
0.0
0.2
""
0.2
0.7
"one"
0.7
1.1
"two"
''',
                encoding="utf-8",
            )

            self.assertEqual(parse_words_tier(textgrid), [Word(0.2, 0.7, "one"), Word(0.7, 1.1, "two")])


if __name__ == "__main__":
    unittest.main()
