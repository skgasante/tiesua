"""Check TieSua's permanent records and their local Markdown links."""
from pathlib import Path
import re
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]
REQUIRED = (
    "AGENTS.md", "CHANGELOG.md", "docs/README.md", "docs/STATUS.md",
    "docs/PROJECT_HISTORY.md", "docs/ARCHITECTURE.md", "docs/DECISIONS/README.md",
    "docs/IDEAS_BACKLOG.md", "docs/VOICE_SYSTEM.md", "docs/MATHEMATICS_ENGINE.md",
    "docs/ACCESSIBILITY.md", "docs/RESEARCH_NOTES.md", "docs/EXPERIMENTS.md",
    "docs/KNOWN_ISSUES.md",
)
LINK = re.compile(r"\]\((?:<([^>]+)>|([^\s)]+))\)")
FENCE = re.compile(r"(?ms)^ {0,3}(`{3,}|~{3,})[^\n]*\n.*?^ {0,3}\1[ \t]*$")


def main() -> int:
    errors = [f"Missing required record {name}" for name in REQUIRED if not (ROOT / name).is_file()]
    files = sorted({ROOT / name for name in (*REQUIRED, "README.md")} | set((ROOT / "docs").rglob("*.md")))
    for file in files:
        if not file.is_file():
            continue
        content = FENCE.sub("", file.read_text(encoding="utf-8"))
        for match in LINK.finditer(content):
            target = urlsplit(match.group(1) or match.group(2))
            if target.scheme or target.netloc or not target.path:
                continue
            path = (file.parent / unquote(target.path)).resolve()
            if not path.is_relative_to(ROOT) or not path.exists():
                errors.append(f"{file.relative_to(ROOT)}: invalid local link {target.path}")
    for error in errors:
        print(error)
    if not errors:
        print(f"Checked {len(files)} Markdown records and their local links.")
    return int(bool(errors))


if __name__ == "__main__":
    raise SystemExit(main())
