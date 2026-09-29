def parse_qualifications(value):
    text = value.strip() if isinstance(value, str) else ""

    if not text:
        return {
            "title": "Qualification",
            "text": "",
        }

    if ":" not in text:
        return {
            "title": "Qualification",
            "text": text,
        }

    title, content = text.split(":", 1)

    title = title.strip()
    content = content.strip()

    return {
        "title": title or "Qualification",
        "text": content,
    }