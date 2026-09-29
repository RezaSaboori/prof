import calendar
import re
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher


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

_RELATIVE_TIME_RE = re.compile(
    r"(?P<number>\d+)"
    r"\s*(?:\+)?\s*"
    r"(?P<unit>[a-zA-Z]+)",
    re.IGNORECASE,
)

_UNIT_ALIASES = {
    "minute": {
        "minute",
        "minutes",
        "min",
        "mins",
        "minut",
        "minuts",
        "minitue",
        "minitues",
        "minuite",
        "minuites",
    },
    "hour": {
        "hour",
        "hours",
        "hr",
        "hrs",
        "hou",
        "houre",
        "houres",
    },
    "day": {
        "day",
        "days",
        "dy",
        "dys",
        "dya",
        "dya",
    },
    "week": {
        "week",
        "weeks",
        "wk",
        "wks",
        "wek",
        "weks",
        "weeek",
        "weeeks",
    },
    "month": {
        "month",
        "months",
        "mo",
        "mos",
        "mth",
        "mths",
        "mon",
        "mons",
        "mounth",
        "mounths",
        "mont",
        "monts",
    },
    "year": {
        "year",
        "years",
        "yr",
        "yrs",
        "yer",
        "yers",
        "yaer",
        "yaers",
    },
}


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


def _normalize_unit(value):
    return re.sub(
        r"[^a-z]",
        "",
        str(value).casefold(),
    )


def _find_unit(value):
    normalized = _normalize_unit(value)

    if not normalized:
        return None

    for canonical, aliases in _UNIT_ALIASES.items():
        if normalized in aliases:
            return canonical

    if len(normalized) < 3:
        return None

    best_unit = None
    best_score = 0

    for canonical, aliases in _UNIT_ALIASES.items():
        for alias in aliases:
            if len(alias) < 3:
                continue

            length_difference = abs(
                len(normalized) - len(alias)
            )

            if length_difference > max(
                2,
                int(len(alias) * 0.4),
            ):
                continue

            score = SequenceMatcher(
                None,
                normalized,
                alias,
            ).ratio()

            if score > best_score:
                best_score = score
                best_unit = canonical

    if best_score >= 0.72:
        return best_unit

    return None


def _parse_relative_value(value):
    if value is None:
        return None

    text = str(value).strip()

    if not text:
        return None

    normalized_text = " ".join(
        text.casefold().split()
    )

    if normalized_text in {
        "today",
        "today ago",
    }:
        return 0, "day"

    if normalized_text in {
        "yesterday",
        "yesterday ago",
    }:
        return 1, "day"

    if normalized_text in {
        "just now",
        "now",
    }:
        return 0, "minute"

    article_match = re.search(
        r"\b(?:a|an|one)\s+([a-zA-Z]+)",
        text,
        flags=re.IGNORECASE,
    )

    if article_match:
        unit = _find_unit(
            article_match.group(1)
        )

        if unit:
            return 1, unit

    for match in _RELATIVE_TIME_RE.finditer(text):
        unit = _find_unit(
            match.group("unit")
        )

        if not unit:
            continue

        try:
            number = int(
                match.group("number")
            )
        except ValueError:
            continue

        if number < 0:
            continue

        return number, unit

    return None


def _subtract_months(value, months):
    total_months = (
        value.year * 12
        + value.month
        - 1
        - months
    )

    year, month_index = divmod(
        total_months,
        12,
    )

    month = month_index + 1

    day = min(
        value.day,
        calendar.monthrange(
            year,
            month,
        )[1],
    )

    return value.replace(
        year=year,
        month=month,
        day=day,
    )


def _calculate_posted_at(observed_at, number, unit):
    if unit == "minute":
        return observed_at - timedelta(
            minutes=number
        )

    if unit == "hour":
        return observed_at - timedelta(
            hours=number
        )

    if unit == "day":
        return observed_at - timedelta(
            days=number
        )

    if unit == "week":
        return observed_at - timedelta(
            weeks=number
        )

    if unit == "month":
        return _subtract_months(
            observed_at,
            number,
        )

    if unit == "year":
        return _subtract_months(
            observed_at,
            number * 12,
        )

    return None


def _display_value(number, unit):
    suffix = unit if number == 1 else f"{unit}s"

    return f"{number} {suffix} ago"


def extract_latest_date_posted(value):
    empty_result = {
        "display": "",
        "sort": "",
    }

    if value is None:
        return empty_result

    text = str(value).strip()

    if not text:
        return empty_result

    timestamped_entries = []

    for line_index, line in enumerate(
        text.splitlines()
    ):
        match = _TIMESTAMP_LINE_RE.match(
            line
        )

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

    if not timestamped_entries:
        return empty_result

    latest_timestamp, _, latest_value = max(
        timestamped_entries,
        key=lambda item: (
            item[0],
            item[1],
        ),
    )

    if not latest_value:
        return empty_result

    relative_value = _parse_relative_value(
        latest_value
    )

    if relative_value is None:
        return empty_result

    number, unit = relative_value

    posted_at = _calculate_posted_at(
        latest_timestamp,
        number,
        unit,
    )

    if posted_at is None:
        return empty_result

    return {
        "display": _display_value(
            number,
            unit,
        ),
        "sort": posted_at.isoformat(),
    }