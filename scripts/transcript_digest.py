"""Turns Claude Code session transcripts (.jsonl) into a readable digest.

Why this exists: a session's transcript never leaves the machine it ran on,
so the reasoning behind past work becomes unfindable even while the file
still sits on disk. `docs/LOG.md` is the project's durable record; this
script is how a transcript gets distilled into something worth putting
there.

Usage:
    python scripts/transcript_digest.py <file.jsonl|dir> [...] > digest.md
    python scripts/transcript_digest.py ~/.claude/projects/ --full

    --full      also include the assistant's replies and tool calls
                (default: only the messages the human actually typed)
    --no-redact keep secrets as-is (default redacts; see SECRET_PATTERNS)

Transcripts routinely contain API keys pasted into the conversation, so
redaction is ON by default and the raw .jsonl files are gitignored. Read
the output before committing any of it.
"""

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path

# Seconds within which the same text from two sources is the same message.
DEDUPE_WINDOW = 10

# Tokens seen in this project's transcripts (Anthropic, HubSpot, Stripe,
# GitHub) plus the generic `key: value` shape. Deliberately greedy: a
# false positive costs a redacted word, a miss leaks a live credential.
SECRET_PATTERNS = [
    re.compile(r"sk-ant-[A-Za-z0-9_\-]{8,}"),
    re.compile(r"sk_(?:live|test)_[A-Za-z0-9]{8,}"),
    re.compile(r"rk_(?:live|test)_[A-Za-z0-9]{8,}"),
    re.compile(r"whsec_[A-Za-z0-9]{8,}"),
    re.compile(r"pat-[a-z0-9]{2,6}-[A-Za-z0-9\-]{8,}"),  # HubSpot private app
    re.compile(r"gh[pousr]_[A-Za-z0-9]{20,}"),
    re.compile(r"github_pat_[A-Za-z0-9_]{20,}"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"neo4j\+s?://[^:\s]+:[^@\s]+@"),  # credentials in a URI
    re.compile(r"postgres(?:ql)?://[^:\s]+:[^@\s]+@"),
    re.compile(
        r"(?i)\b(api[_-]?key|access[_-]?token|auth[_-]?token|secret|password|senha)"
        r"\b\s*[:=]\s*[\"']?([A-Za-z0-9_\-/+]{16,})"
    ),
    re.compile(r"(?i)bearer\s+[A-Za-z0-9_\-\.]{20,}"),
]

# Lines the harness injects into the `user` role that nobody typed.
INJECTED_PREFIXES = (
    "<system-reminder>",
    "<command-name>",
    "<local-command-stdout>",
    "<user-memory-input>",
    "Caveat: The messages below were generated",
    "[Request interrupted",
)


def redact(text):
    for pattern in SECRET_PATTERNS:
        text = pattern.sub(
            lambda m: (
                # Keep the label ("api_key:"), drop only the value.
                f"{m.group(1)}=[REDIGIDO]"
                if m.re.groups >= 2 and m.group(1)
                else "[REDIGIDO]"
            ),
            text,
        )
    return text


def is_typed_prompt(entry):
    """True only for a message the human actually typed.

    Most `type: "user"` lines are tool results fed back to the model, not
    human input. The two reliable tells: a typed prompt carries
    `promptSource`, and its content is a plain string rather than a list
    of tool_result blocks.
    """
    if entry.get("type") != "user":
        return False
    if entry.get("isSidechain"):  # subagent conversation, not the human
        return False
    content = entry.get("message", {}).get("content")
    if isinstance(content, list):
        # A typed prompt with an attachment arrives as text blocks only.
        if any(b.get("type") != "text" for b in content if isinstance(b, dict)):
            return False
    return bool(entry.get("promptSource")) or isinstance(content, str)


def seconds(timestamp):
    """Epoch-ish seconds from an ISO timestamp, for the dedupe window only."""
    try:
        return datetime.fromisoformat(
            (timestamp or "").replace("Z", "+00:00")
        ).timestamp()
    except ValueError:
        return 0.0


def add_human(session, timestamp, text):
    """Record a message the human typed, once.

    A prompt sent between turns is logged twice — as a `user` line and as
    a queue enqueue — while one sent mid-turn is logged only as the
    enqueue. Same text within a few seconds is the same message, whichever
    form arrives first.
    """
    if not text or text.startswith(INJECTED_PREFIXES):
        return
    when = seconds(timestamp)
    for other, other_when in session["spoken"]:
        if text == other and abs(when - other_when) <= DEDUPE_WINDOW:
            return
    session["spoken"].add((text, when))
    session["events"].append(("human", timestamp, text))


def enqueued_text(entry):
    """Text of a message typed while a turn was already running.

    These never appear as a `type: "user"` line — the harness absorbs them
    mid-turn and only records the queue operation. Without reading these,
    a digest silently drops every message sent while Claude was working,
    which in practice is a lot of them.
    """
    if entry.get("type") != "queue-operation":
        return None
    if entry.get("operation") != "enqueue":
        return None
    return (entry.get("content") or "").strip() or None


def flatten(content):
    if isinstance(content, str):
        return content
    parts = []
    for block in content or []:
        if not isinstance(block, dict):
            continue
        if block.get("type") == "text":
            parts.append(block.get("text", ""))
    return "\n".join(parts)


def summarize_tool_use(block):
    name = block.get("name", "?")
    args = block.get("input") or {}
    for key in ("command", "file_path", "pattern", "path", "url", "prompt"):
        if key in args:
            value = str(args[key]).replace("\n", " ")
            if len(value) > 120:
                value = value[:117] + "..."
            return f"{name}: {value}"
    return name


def read_entries(path):
    """Yield parsed JSONL entries, skipping unparseable lines."""
    with path.open(encoding="utf-8", errors="replace") as handle:
        for number, line in enumerate(handle, 1):
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                print(
                    f"  aviso: {path.name} linha {number} ilegivel, ignorada",
                    file=sys.stderr,
                )


def collect(paths):
    """Group entries by session id, preserving per-session metadata."""
    sessions = {}
    for path in paths:
        for entry in read_entries(path):
            session_id = entry.get("sessionId") or path.stem
            session = sessions.setdefault(
                session_id,
                {
                    "id": session_id,
                    "file": path.name,
                    "cwd": None,
                    "branch": None,
                    "version": None,
                    "first": None,
                    "last": None,
                    "events": [],
                    "spoken": set(),
                },
            )
            timestamp = entry.get("timestamp") or ""
            if timestamp:
                if not session["first"] or timestamp < session["first"]:
                    session["first"] = timestamp
                if not session["last"] or timestamp > session["last"]:
                    session["last"] = timestamp
            session["cwd"] = session["cwd"] or entry.get("cwd")
            session["branch"] = session["branch"] or entry.get("gitBranch")
            session["version"] = session["version"] or entry.get("version")

            if is_typed_prompt(entry):
                text = flatten(entry["message"].get("content")).strip()
                add_human(session, timestamp, text)
            elif enqueued_text(entry):
                add_human(session, timestamp, enqueued_text(entry))
            elif entry.get("type") == "assistant" and not entry.get("isSidechain"):
                content = entry.get("message", {}).get("content") or []
                text = flatten(content).strip()
                if text:
                    session["events"].append(("claude", timestamp, text))
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "tool_use":
                        session["events"].append(
                            ("tool", timestamp, summarize_tool_use(block))
                        )
    return sessions


def render(sessions, full, do_redact):
    out = ["# Transcripts recuperados", ""]
    ordered = sorted(sessions.values(), key=lambda s: s["first"] or "")
    for session in ordered:
        spoken = [e for e in session["events"] if e[0] == "human"]
        session["events"].sort(key=lambda e: e[1] or "")
        out.append(f"## Sessao `{session['id']}`")
        out.append("")
        out.append(f"- **Arquivo:** `{session['file']}`")
        out.append(f"- **Periodo:** {(session['first'] or '?')[:19]} -> "
                   f"{(session['last'] or '?')[:19]}")
        if session["cwd"]:
            out.append(f"- **Pasta:** `{session['cwd']}`")
        if session["branch"]:
            out.append(f"- **Branch:** `{session['branch']}`")
        if session["version"]:
            out.append(f"- **Claude Code:** {session['version']}")
        out.append(f"- **Mensagens digitadas:** {len(spoken)}")
        out.append("")

        events = sorted(
            session["events"] if full else spoken, key=lambda e: e[1] or ""
        )
        for kind, timestamp, text in events:
            if do_redact:
                text = redact(text)
            stamp = timestamp[11:19] if len(timestamp) >= 19 else ""
            if kind == "human":
                out.append(f"### {stamp} — voce")
                out.append("")
                out.append("\n".join(f"> {l}" for l in text.splitlines()))
                out.append("")
            elif kind == "claude":
                out.append(f"**{stamp} — Claude:** {text}")
                out.append("")
            else:
                out.append(f"- `{stamp}` {text}")
        out.append("")
    return "\n".join(out)


def expand(raw_paths):
    files = []
    for raw in raw_paths:
        path = Path(raw).expanduser()
        if path.is_dir():
            files.extend(sorted(path.rglob("*.jsonl")))
        elif path.exists():
            files.append(path)
        else:
            print(f"aviso: {path} nao existe, ignorado", file=sys.stderr)
    return files


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("paths", nargs="+", help="arquivos .jsonl ou pastas")
    parser.add_argument("--full", action="store_true",
                        help="incluir respostas do Claude e chamadas de ferramenta")
    parser.add_argument("--no-redact", action="store_true",
                        help="nao mascarar credenciais (cuidado)")
    args = parser.parse_args()

    files = expand(args.paths)
    if not files:
        print("nenhum .jsonl encontrado", file=sys.stderr)
        return 1

    print(f"lendo {len(files)} arquivo(s)...", file=sys.stderr)
    sessions = collect(files)
    if not sessions:
        print("nenhuma sessao encontrada nos arquivos", file=sys.stderr)
        return 1

    sys.stdout.write(render(sessions, args.full, not args.no_redact))
    print(f"{len(sessions)} sessao(oes) processada(s)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
