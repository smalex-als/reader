from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Word:
    start: float
    end: float
    text: str


WORD_TIER_NAMES = {"word", "words"}
IGNORED_WORDS = {"", "<eps>", "<sil>", "sil", "sp", "spn"}


def parse_words_tier(path: Path) -> list[Word]:
    content = path.read_text(encoding="utf-8")

    words = parse_long_textgrid(content)
    if words:
        return words

    words = parse_short_textgrid(content)
    if words:
        return words

    raise ValueError(f"TextGrid does not contain a words tier: {path}")


def parse_long_textgrid(content: str) -> list[Word]:
    for block in iter_item_blocks(content):
        name = find_quoted_field(block, "name")
        if name.lower() not in WORD_TIER_NAMES:
            continue

        words = [
            word
            for word in parse_long_intervals(block)
            if normalized_word(word.text) not in IGNORED_WORDS
        ]
        return words

    return []


def iter_item_blocks(content: str) -> list[str]:
    matches = list(re.finditer(r"(?m)^\s*item \[\d+\]:\s*$", content))
    blocks: list[str] = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(content)
        blocks.append(content[match.start() : end])
    return blocks


def find_quoted_field(block: str, field: str) -> str:
    match = re.search(rf'(?m)^\s*{re.escape(field)}\s*=\s*"((?:[^"]|"")*)"\s*$', block)
    if not match:
        return ""
    return unescape_praat_string(match.group(1))


def parse_long_intervals(block: str) -> list[Word]:
    pattern = re.compile(
        r'(?ms)^\s*intervals \[\d+\]:\s*'
        r"\n\s*xmin\s*=\s*(?P<start>[-+0-9.eE]+)\s*"
        r"\n\s*xmax\s*=\s*(?P<end>[-+0-9.eE]+)\s*"
        r'\n\s*text\s*=\s*"(?P<text>(?:[^"]|"")*)"\s*$'
    )
    return [
        Word(float(match.group("start")), float(match.group("end")), unescape_praat_string(match.group("text")).strip())
        for match in pattern.finditer(block)
    ]


def parse_short_textgrid(content: str) -> list[Word]:
    lines = [line.strip() for line in content.splitlines() if line.strip()]

    index = 0
    while index < len(lines):
        if lines[index] != '"IntervalTier"':
            index += 1
            continue

        if index + 1 >= len(lines):
            return []

        tier_name = unquote_praat_line(lines[index + 1]).lower()
        next_tier = find_next_interval_tier(lines, index + 1)
        tier_lines = lines[index + 2 : next_tier]
        if tier_name in WORD_TIER_NAMES:
            return parse_short_interval_lines(tier_lines)

        index = next_tier

    return []


def find_next_interval_tier(lines: list[str], start: int) -> int:
    for index in range(start + 1, len(lines)):
        if lines[index] == '"IntervalTier"':
            return index
    return len(lines)


def parse_short_interval_lines(lines: list[str]) -> list[Word]:
    words: list[Word] = []
    index = 3
    while index + 2 < len(lines):
        start = maybe_float(lines[index])
        end = maybe_float(lines[index + 1])
        text = unquote_praat_line(lines[index + 2]).strip()
        if start is not None and end is not None and normalized_word(text) not in IGNORED_WORDS:
            words.append(Word(start, end, text))
            index += 3
        else:
            index += 1
    return words


def maybe_float(value: str) -> float | None:
    try:
        return float(value)
    except ValueError:
        return None


def unquote_praat_line(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == '"' and value[-1] == '"':
        return unescape_praat_string(value[1:-1])
    return value


def unescape_praat_string(value: str) -> str:
    return value.replace('""', '"')


def normalized_word(value: str) -> str:
    return value.strip().lower()
