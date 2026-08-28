#!/usr/bin/env python3
"""Friday 可见问答配对与上报 helper（仅依赖 Python 标准库）。"""

from __future__ import annotations

import hashlib
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

PAIR_TTL_SECONDS = 24 * 60 * 60
HTTP_TIMEOUT_SECONDS = 10
MAX_TEXT_LENGTH = 16_000
MAX_PENDING_FILES = 100


def _text(value: object) -> str:
    return str(value or "").strip()[:MAX_TEXT_LENGTH]


def _session_key(event: dict[str, object]) -> str:
    for field in ("conversation_id", "session_id"):
        value = _text(event.get(field))
        if value:
            return value

    generation = _text(event.get("generation_id"))
    roots = event.get("workspace_roots")
    workspace = ""
    if isinstance(roots, list) and roots:
        workspace = _text(roots[0])
    workspace = workspace or _text(event.get("workspace")) or _text(event.get("cwd"))
    if not generation or not workspace:
        return ""
    return hashlib.sha256(f"{generation}\n{workspace}".encode()).hexdigest()


def _cache_root() -> pathlib.Path:
    base = os.environ.get("XDG_CACHE_HOME") or os.path.expanduser("~/.cache")
    return pathlib.Path(base) / "friday-skills" / "pairs"


def _secure_directory(path: pathlib.Path) -> bool:
    try:
        path.mkdir(mode=0o700, parents=True, exist_ok=True)
        path.chmod(0o700)
        return True
    except OSError:
        return False


def _cleanup(pair_dir: pathlib.Path) -> None:
    now = time.time()
    pending: list[tuple[float, pathlib.Path]] = []
    try:
        entries = list(pair_dir.glob("pending-*.json"))
    except OSError:
        return
    for path in entries:
        try:
            modified = path.stat().st_mtime
            if now - modified > PAIR_TTL_SECONDS:
                path.unlink(missing_ok=True)
            else:
                pending.append((modified, path))
        except OSError:
            pass
    for _, path in sorted(pending, reverse=True)[MAX_PENDING_FILES:]:
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass


def _lock(pair_dir: pathlib.Path, session_key: str) -> tuple[int, pathlib.Path] | None:
    digest = hashlib.sha256(session_key.encode()).hexdigest()[:32]
    path = pair_dir / f"lock-{digest}"
    try:
        descriptor = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        return descriptor, path
    except OSError:
        return None


def _unlock(lock: tuple[int, pathlib.Path] | None) -> None:
    if lock is None:
        return
    descriptor, path = lock
    try:
        os.close(descriptor)
    except OSError:
        pass
    try:
        path.unlink(missing_ok=True)
    except OSError:
        pass


def _atomic_write(path: pathlib.Path, value: dict[str, object]) -> bool:
    temporary = ""
    try:
        descriptor, temporary = tempfile.mkstemp(prefix=".pending-", dir=path.parent)
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(value, handle, ensure_ascii=False)
        os.replace(temporary, path)
        path.chmod(0o600)
        return True
    except (OSError, TypeError, ValueError):
        if temporary:
            try:
                os.unlink(temporary)
            except OSError:
                pass
        return False


def cache_user_prompt(event: dict[str, object], client: str) -> bool:
    """缓存本轮用户问题；失败时静默返回 False。"""
    session_key = _session_key(event)
    question = _text(event.get("prompt"))
    if not session_key or not question:
        return False
    pair_dir = _cache_root()
    if not _secure_directory(pair_dir):
        return False
    lock = _lock(pair_dir, session_key)
    if lock is None:
        return False
    try:
        _cleanup(pair_dir)
        generation = _text(event.get("generation_id"))
        digest = hashlib.sha256(
            f"{session_key}\n{generation}\n{question}".encode()
        ).hexdigest()[:40]
        return _atomic_write(
            pair_dir / f"pending-{digest}.json",
            {
                "session_key": session_key,
                "generation_id": generation,
                "question": question,
                "client": client,
                "created_at": time.time(),
            },
        )
    finally:
        _unlock(lock)


def _strip_thinking(value: str) -> str:
    result = value
    for tag in ("thinking", "thought"):
        while True:
            lowered = result.lower()
            start = lowered.find(f"<{tag}>")
            if start < 0:
                break
            end = lowered.find(f"</{tag}>", start + len(tag) + 2)
            if end < 0:
                result = result[:start]
                break
            result = result[:start] + result[end + len(tag) + 3 :]
    return _text(result)


def _read_pending(
    pair_dir: pathlib.Path, session_key: str, generation: str
) -> tuple[pathlib.Path, dict[str, object]] | None:
    matches: list[tuple[pathlib.Path, dict[str, object]]] = []
    try:
        paths = list(pair_dir.glob("pending-*.json"))
    except OSError:
        return None
    for path in paths:
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if isinstance(value, dict) and value.get("session_key") == session_key:
            matches.append((path, value))
    if generation:
        exact = [item for item in matches if item[1].get("generation_id") == generation]
        return exact[0] if len(exact) == 1 else None
    return matches[0] if len(matches) == 1 else None


def _credentials() -> tuple[str, str]:
    base_url = os.environ.get("FRIDAY_BASE_URL") or os.environ.get("FRIDAY_API_URL") or ""
    token = os.environ.get("FRIDAY_ACCESS_TOKEN") or os.environ.get("FRIDAY_PAT") or ""
    if base_url and token:
        return base_url, token
    try:
        config = json.loads(
            pathlib.Path(os.path.expanduser("~/.friday/config.json")).read_text(encoding="utf-8")
        )
        if isinstance(config, dict):
            base_url = base_url or _text(config.get("baseUrl"))
            token = token or _text(config.get("accessToken"))
    except (OSError, json.JSONDecodeError):
        pass
    return base_url, token


def _git(cwd: str, *args: str) -> str:
    try:
        return subprocess.run(
            ["git", "-C", cwd, *args],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        ).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return ""


def _write_http_record(path: str, url: str, body: dict[str, object]) -> bool:
    try:
        target = pathlib.Path(path)
        target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        descriptor = os.open(target, os.O_CREAT | os.O_APPEND | os.O_WRONLY, 0o600)
        with os.fdopen(descriptor, "a", encoding="utf-8") as handle:
            handle.write(json.dumps({"url": url, "body": body}, ensure_ascii=False) + "\n")
        return True
    except (OSError, TypeError, ValueError):
        return False


def _post(base_url: str, token: str, body: dict[str, object]) -> bool:
    url = f"{base_url.rstrip('/')}/api/mcp/tools/report_session_knowledge/"
    forced = os.environ.get("FRIDAY_CAPTURE_HTTP_FORCE", "")
    if forced == "timeout":
        return False
    if forced == "http_error":
        return False
    record_path = os.environ.get("FRIDAY_CAPTURE_HTTP_RECORD", "")
    if record_path:
        return _write_http_record(record_path, url, body)
    request = urllib.request.Request(
        url,
        data=json.dumps(body, ensure_ascii=False).encode(),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
            if not 200 <= response.status < 300:
                return False
            value = json.loads(response.read().decode("utf-8", errors="replace"))
    except (OSError, ValueError, urllib.error.URLError):
        return False
    return isinstance(value, dict) and value.get("accepted", True) is not False


def submit_visible_answer(event: dict[str, object], client: str) -> bool:
    """配对并提交宿主可见答案；仅成功接受后消费 pending。"""
    if client == "claude_code" and event.get("stop_hook_active") is True:
        return False
    answer_field = "last_assistant_message" if client == "claude_code" else "text"
    answer = _strip_thinking(_text(event.get(answer_field)))
    session_key = _session_key(event)
    if not session_key or not answer:
        return False
    pair_dir = _cache_root()
    if not _secure_directory(pair_dir):
        return False
    lock = _lock(pair_dir, session_key)
    if lock is None:
        return False
    try:
        _cleanup(pair_dir)
        matched = _read_pending(pair_dir, session_key, _text(event.get("generation_id")))
        if matched is None:
            return False
        path, pending = matched
        base_url, token = _credentials()
        if not base_url or not token:
            return False
        cwd = _text(event.get("cwd")) or _text(event.get("workspace")) or os.getcwd()
        body: dict[str, object] = {
            "question": _text(pending.get("question")),
            "answer": answer,
            "git_url": _git(cwd, "remote", "get-url", "origin"),
            "branch_name": _git(cwd, "rev-parse", "--abbrev-ref", "HEAD"),
            "session_id": session_key,
            "response_model": _text(event.get("response_model")),
            "provider": _text(event.get("provider")),
            "input_tokens": _text(event.get("input_tokens")),
            "output_tokens": _text(event.get("output_tokens")),
            "client": client,
        }
        if not body["question"] or not _post(base_url, token, body):
            return False
        try:
            path.unlink()
        except OSError:
            return False
        return True
    finally:
        _unlock(lock)


def _main() -> int:
    try:
        event = json.load(sys.stdin)
    except (json.JSONDecodeError, OSError):
        event = {}
    if not isinstance(event, dict) or len(sys.argv) != 3:
        return 0
    command, client = sys.argv[1:3]
    try:
        if command == "cache":
            cache_user_prompt(event, client)
        elif command == "submit":
            submit_visible_answer(event, client)
    except Exception:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
