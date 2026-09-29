import ast
import json
import re
import unicodedata
from difflib import SequenceMatcher


_KEY_ALIASES = {
    "core_values": {
        "corevalues",
        "corevalue",
        "companycorevalues",
        "companyvalues",
        "values",
        "valuesandprinciples",
        "companyvaluesandprinciples",
        "coreprinciples",
        "companyprinciples",
    },
    "core_mission": {
        "coremission",
        "companycoremission",
        "companymission",
        "mission",
        "missionstatement",
        "coremissionstatement",
        "companymissionstatement",
    },
    "culture_tone": {
        "culturetone",
        "companyculturetone",
        "companyculture",
        "culture",
        "workculture",
        "workplacetone",
        "cultureandtone",
    },
    "recent_news_or_focus": {
        "recentnewsorfocus",
        "recentnewsfocus",
        "recentnews",
        "recentfocus",
        "latestnews",
        "latestfocus",
        "currentfocus",
        "companyfocus",
        "newsorfocus",
    },
}


def _normalize_key(value):
    normalized = unicodedata.normalize(
        "NFKD",
        str(value),
    ).casefold()

    return re.sub(
        r"[^a-z0-9]+",
        "",
        normalized,
    )


def _clean_json_text(value):
    return (
        value
        .replace("\ufeff", "")
        .replace("\u00a0", " ")
        .replace("“", '"')
        .replace("”", '"')
        .strip()
    )


def _strip_code_fence(value):
    text = _clean_json_text(value)

    text = re.sub(
        r"^\s*```(?:json|javascript|js|python)?\s*",
        "",
        text,
        flags=re.IGNORECASE,
    )

    text = re.sub(
        r"\s*```\s*$",
        "",
        text,
    )

    return text.strip()


def _decode_string(value):
    current = _strip_code_fence(value)

    for _ in range(4):
        if not isinstance(current, str):
            return current

        text = _strip_code_fence(current)
        candidates = [text]

        first_brace = text.find("{")
        last_brace = text.rfind("}")

        if (
            first_brace != -1
            and last_brace > first_brace
        ):
            object_text = text[
                first_brace:
                last_brace + 1
            ]

            if object_text != text:
                candidates.append(object_text)

        decoded = None

        for candidate in candidates:
            variants = [
                candidate,
                re.sub(
                    r",\s*([}\]])",
                    r"\1",
                    candidate,
                ),
            ]

            for variant in variants:
                for decoder in (
                    json.loads,
                    ast.literal_eval,
                ):
                    try:
                        decoded = decoder(variant)
                        break
                    except (
                        ValueError,
                        TypeError,
                        SyntaxError,
                        json.JSONDecodeError,
                    ):
                        continue

                if decoded is not None:
                    break

            if decoded is not None:
                break

        if decoded is None:
            return {}

        current = decoded

    return current


def _coerce_root(value):
    current = value

    if isinstance(current, str):
        current = _decode_string(current)

    if isinstance(current, dict):
        return current

    if isinstance(current, list):
        for item in current:
            parsed = _coerce_root(item)

            if parsed:
                return parsed

    return {}


def _iter_items(value):
    if isinstance(value, dict):
        for key, item in value.items():
            yield key, item

            if isinstance(
                item,
                (dict, list),
            ):
                yield from _iter_items(item)

    elif isinstance(value, list):
        for item in value:
            yield from _iter_items(item)


def _is_empty(value):
    if value is None:
        return True

    if isinstance(value, str):
        return not value.strip()

    if isinstance(value, (list, dict)):
        return not value

    return False


def _find_value(root, aliases):
    items = list(_iter_items(root))

    normalized_aliases = {
        _normalize_key(alias)
        for alias in aliases
    }

    for key, value in items:
        if _is_empty(value):
            continue

        if _normalize_key(key) in normalized_aliases:
            return value

    best_score = 0
    best_value = None

    for key, value in items:
        if _is_empty(value):
            continue

        normalized_key = _normalize_key(key)

        if not normalized_key:
            continue

        for alias in normalized_aliases:
            length_difference = abs(
                len(normalized_key) - len(alias)
            )

            if length_difference > max(
                3,
                int(len(alias) * 0.35),
            ):
                continue

            score = SequenceMatcher(
                None,
                normalized_key,
                alias,
            ).ratio()

            if score > best_score:
                best_score = score
                best_value = value

    if best_score >= 0.82:
        return best_value

    return None


def _to_markdown(value):
    if _is_empty(value):
        return ""

    if isinstance(value, str):
        return value.strip()

    if isinstance(value, list):
        lines = []

        for item in value:
            text = _to_markdown(item)

            if text:
                lines.append(f"* {text}")

        return "\n".join(lines)

    if isinstance(value, dict):
        lines = []

        for key, item in value.items():
            text = _to_markdown(item)

            if not text:
                continue

            label = (
                str(key)
                .replace("_", " ")
                .strip()
                .title()
            )

            lines.append(
                f"* **{label}:** {text}"
            )

        return "\n".join(lines)

    return str(value).strip()


def extract_company_research(value):
    root = _coerce_root(value)

    if not root:
        return {}

    result = {}

    for key, aliases in _KEY_ALIASES.items():
        value = _find_value(
            root,
            aliases,
        )

        markdown = _to_markdown(value)

        if markdown:
            result[key] = markdown

    return result