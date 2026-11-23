#!/usr/bin/env python3
"""Read-only, dependency-free static checks for repository-scoped Agent Skills.

This validates metadata and flags a small number of dangerous shell-command
patterns. It does not execute third-party material or certify security.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

NAME = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*\Z")
NAME_FIELD = re.compile(r"^name:\s*['\"]?([a-z0-9-]+)['\"]?\s*$", re.M)
DESCRIPTION_FIELD = re.compile(r"^description:\s*(.*?)\s*$", re.M)
HIGH_RISK = (
    ("download-pipe-shell", re.compile(r"\b(?:curl|wget)\b[^\n|]*\|\s*(?:sh|bash)\b", re.I)),
    ("recursive-root-delete", re.compile(r"\brm\s+-[rf]{2,}\s+/(?:\s|$)", re.I | re.M)),
    ("encoded-shell-execution", re.compile(r"\b(?:base64\s+-d|base64\s+--decode)\b[^\n|]*\|\s*(?:sh|bash)\b", re.I)),
)


def check_skill(path: Path) -> list[str]:
    """Return human-readable errors for one skill without executing its content."""
    errors: list[str] = []
    if path.is_symlink() or not path.is_file():
        return ["SKILL.md must be a regular non-symlink file"]
    if path.stat().st_size > 128 * 1024:
        return ["SKILL.md exceeds 128 KiB review limit"]
    try:
        source = path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError) as error:
        return [f"cannot read UTF-8: {error}"]
    if not source.startswith("---\n"):
        return ["missing opening YAML frontmatter delimiter"]
    closing = source.find("\n---\n", 4)
    if closing < 0:
        return ["missing closing YAML frontmatter delimiter"]
    header = source[4:closing]
    name = NAME_FIELD.search(header)
    if not name:
        errors.append("missing or invalid name")
    elif not NAME.fullmatch(name.group(1)) or name.group(1) != path.parent.name:
        errors.append("name must match its kebab-case directory")
    description = DESCRIPTION_FIELD.search(header)
    if not description:
        errors.append("missing description")
    elif description.group(1).strip(" '\"") in ("", "|", "|-", ">", ">-"):
        if not re.search(r"^description:\s*[|>]-?\s*\n[ \t]+\S+", header, re.M):
            errors.append("description must not be empty")
    if not source[closing + 5 :].strip():
        errors.append("empty skill body")
    for label, pattern in HIGH_RISK:
        if pattern.search(source):
            errors.append(f"high-risk command pattern: {label}; manual review required")
    return errors


def check_root(root: Path) -> tuple[int, list[str]]:
    if not root.is_dir() or root.is_symlink():
        return 0, [f"{root}: not a regular skills directory"]
    files = sorted(root.glob("*/SKILL.md"))
    if not files:
        return 0, [f"{root}: no SKILL.md files found"]
    errors: list[str] = []
    for file in files:
        errors.extend(f"{file}: {issue}" for issue in check_skill(file))
    for directory in root.iterdir():
        if directory.is_symlink():
            errors.append(f"{directory}: symlinked skill directory")
        elif directory.is_dir() and not (directory / "SKILL.md").is_file():
            errors.append(f"{directory}: missing SKILL.md")
    return len(files), errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path, help="Root skill directory (e.g. .agents/skills)")
    args = parser.parse_args(argv)
    count, errors = check_root(args.root)
    if errors:
        print(f"FAIL: reviewed {count} skills, {len(errors)} issue(s)", file=sys.stderr)
        for issue in errors:
            print(f"- {issue}", file=sys.stderr)
        return 1
    print(f"PASS: {count} skill files pass static metadata and command-pattern checks.")
    print("Note: no external code was executed; security and behavior are not certified.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
