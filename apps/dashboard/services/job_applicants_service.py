import re
from datetime import datetime, timezone


_TIMESTAMP_LINE_RE = re.compile(
    r"^\s*"
    r"(?P<timestamp>"
    r"\d{4}-\d{2}-\d{2}"
    r"T"
    r"\d{2}:\d{2}:\d{2}"
    r"(?:\.\d+)?"
    r"(?:Z|[+-]\d{2}:\d{2})?"
    r")"
    r"\s*:\s*"
    r"(?P<value>.*)"
    r"\s*$",
    re.IGNORECASE,
)

_NUMBER_RE = re.compile(
    r"(?<!\d)"
    r"(?P<number>"
    r"\d{1,3}(?:[,\s]\d{3})+"
    r"|"
    r"\d+"
    r")"
    r"(?!\d)"
)


def _parse_timestamp(value):
    text = value.strip()

    if text.endswith(("Z", "z")):
        text = f"{text[:-1]}+00:00"

    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)

    return parsed


def _extract_number(value):
    if value is None:
        return None

    text = str(value).strip()

    if not text:
        return None

    match = _NUMBER_RE.search(text)

    if not match:
        return None

    normalized = re.sub(
        r"[,\s]",
        "",
        match.group("number"),
    )

    try:
        return int(normalized)
    except ValueError:
        return None


def extract_latest_applicants(value):
    if value is None:
        return ""

    if isinstance(value, (int, float)):
        if value < 0:
            return ""

        return f"{int(value)} applicants"

    text = str(value).strip()

    if not text:
        return ""

    timestamped_entries = []

    for line_index, line in enumerate(text.splitlines()):
        match = _TIMESTAMP_LINE_RE.match(line)

        if not match:
            continue

        timestamp = _parse_timestamp(
            match.group("timestamp")
        )

        if timestamp is None:
            continue

        timestamped_entries.append(
            (
                timestamp,
                line_index,
                match.group("value").strip(),
            )
        )

    if timestamped_entries:
        latest_entry = max(
            timestamped_entries,
            key=lambda item: (
                item[0],
                item[1],
            ),
        )

        applicants_number = _extract_number(
            latest_entry[2]
        )

        if applicants_number is None:
            return ""

        return f"{applicants_number} applicants"

    non_empty_lines = [
        line.strip()
        for line in text.splitlines()
        if line.strip()
    ]

    if not non_empty_lines:
        return ""

    applicants_number = _extract_number(
        non_empty_lines[-1]
    )

    if applicants_number is None:
        return ""

    return f"{applicants_number} applicants"