import re
from difflib import SequenceMatcher


_HEADING_EDGE_RE = re.compile(r"^[\s#>*_`~]+|[\s#>*_`~]+$")
_HEADING_SEPARATOR_RE = re.compile(
    r"\s*(?::|：|\s[-–—]\s)\s*",
    re.UNICODE,
)
_NON_ALPHA_RE = re.compile(r"[^a-z]+")


def _heading_parts(line):
    cleaned = _HEADING_EDGE_RE.sub("", (line or "").strip())

    if not cleaned:
        return "", ""

    parts = _HEADING_SEPARATOR_RE.split(cleaned, maxsplit=1)
    heading = parts[0].strip()
    remainder = parts[1].strip() if len(parts) > 1 else ""

    normalized = _NON_ALPHA_RE.sub("", heading.casefold())

    return normalized, remainder.strip("*_`~ ")


def _matches_heading(line, target):
    normalized, _ = _heading_parts(line)

    if not normalized:
        return False

    if (
        len(normalized) < max(4, len(target) - 4)
        or len(normalized) > len(target) + 4
    ):
        return False

    return SequenceMatcher(
        None,
        normalized,
        target,
    ).ratio() >= 0.72


def extract_analysis(score_rationale):
    if (
        not isinstance(score_rationale, str)
        or not score_rationale.strip()
    ):
        return ""

    lines = (
        score_rationale
        .replace("\r\n", "\n")
        .replace("\r", "\n")
        .split("\n")
    )

    analysis_index = next(
        (
            index
            for index, line in enumerate(lines)
            if _matches_heading(line, "analysis")
        ),
        None,
    )

    calculation_search_start = (
        analysis_index + 1
        if analysis_index is not None
        else 0
    )

    calculation_index = next(
        (
            index
            for index, line in enumerate(
                lines[calculation_search_start:],
                start=calculation_search_start,
            )
            if _matches_heading(line, "calculation")
        ),
        None,
    )

    if analysis_index is not None:
        _, inline_content = _heading_parts(
            lines[analysis_index]
        )

        content_lines = []

        if inline_content:
            content_lines.append(inline_content)

        content_lines.extend(
            lines[
                analysis_index + 1:
                calculation_index
            ]
        )
    elif calculation_index is not None:
        content_lines = lines[:calculation_index]
    else:
        return ""

    return "\n".join(content_lines).strip()