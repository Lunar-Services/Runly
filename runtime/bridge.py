"""Runs inside an individual hosted sandbox; never on the Runly web server."""
import base64
import hashlib
import http.client
import json
import os
import re
from pathlib import Path
import signal
import subprocess
import threading
import time
import uuid

ROOT = Path(os.environ.get("RUNLY_PROJECT_ROOT", "/workspace/project")).resolve()
MAX_FILE = 1024 * 1024
MAX_TOTAL = 8 * MAX_FILE
MAX_FILES = 1000
MAX_PREVIEW_BODY = 1024 * 1024
MAX_PREVIEW_RESPONSE = 8 * 1024 * 1024
PREVIEW_METHODS = {"GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"}
IGNORED = {"node_modules", ".git", ".next", "dist", "build", ".cache", "__pycache__", ".venv", ".runly", ".npmrc", ".pypirc", ".netrc", ".ssh", ".aws"}
GIT_BRANCH = re.compile(r"^(?!-)(?!.*(?:\.\.|@\{|//|\.lock(?:/|$)))[A-Za-z0-9_][A-Za-z0-9_./-]{0,99}$")
GITHUB_URL = re.compile(r"^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+\.git$")


def excluded_name(name):
    name = name.lower()
    return name in IGNORED or name.startswith(".env") or name.endswith((".pem", ".key")) or name in {"id_rsa", "id_ed25519", "credentials.json", "service-account.json"}


def safe_path(value):
    if not isinstance(value, str) or not value or len(value) > 1024 or "\\" in value or ":" in value or any(ord(c) < 32 for c in value):
        raise ValueError("Invalid relative file path")
    parts = value.split("/")
    if any(p in ("", ".", "..") or excluded_name(p) for p in parts):
        raise ValueError("Invalid relative file path")
    candidate = ROOT.joinpath(*parts)
    if not candidate.resolve().is_relative_to(ROOT) or any(p.is_symlink() for p in [candidate, *candidate.parents] if p != ROOT.parent):
        raise ValueError("Symlinks cannot be edited through Explorer")
    return candidate


def file_hash(path):
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else ""


class Bridge:
    def __init__(self, send):
        self.send = send
        self.lock = threading.RLock()
        self.terminal = None
        self.master = None
        self.app = None
        self.previous = {}
        self.cache = {}
        self.alive = True
        self.preview_ready = False
        self.preview_slots = threading.BoundedSemaphore(32)
        self.command_slots = threading.BoundedSemaphore(16)

    def handle_preview_request(self, message):
        request_id = message.get("id")
        if not isinstance(request_id, str) or len(request_id) > 64:
            return
        if not self.preview_slots.acquire(blocking=False):
            self.send({"type": "preview.response", "id": request_id, "status": 503, "headers": [], "body": ""})
            return

        def forward():
            connection = None
            try:
                method = message.get("method")
                path = message.get("path")
                if method not in PREVIEW_METHODS or not isinstance(path, str) or not path.startswith("/") or path.startswith("//") or len(path) > 4096 or "\r" in path or "\n" in path:
                    raise ValueError("Invalid preview request")
                body = base64.b64decode(message.get("body", ""), validate=True)
                if len(body) > MAX_PREVIEW_BODY:
                    raise ValueError("Preview request body exceeds 1 MiB")
                blocked = {"connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade", "host", "content-length"}
                headers = {}
                for pair in message.get("headers", []):
                    if not isinstance(pair, list) or len(pair) != 2:
                        continue
                    name, value = pair
                    if isinstance(name, str) and isinstance(value, str) and name.lower() not in blocked and "\r" not in value and "\n" not in value:
                        headers[name] = value
                port = int(os.environ.get("RUNLY_PREVIEW_PORT", "3000"))
                connection = http.client.HTTPConnection("127.0.0.1", port, timeout=30)
                connection.request(method, path, body=body, headers=headers)
                response = connection.getresponse()
                payload = response.read(MAX_PREVIEW_RESPONSE + 1)
                if len(payload) > MAX_PREVIEW_RESPONSE:
                    raise ValueError("Preview response exceeds 8 MiB")
                response_headers = [[name, value] for name, value in response.getheaders()]
                self.send({"type": "preview.response", "id": request_id, "status": response.status, "headers": response_headers, "body": base64.b64encode(payload).decode("ascii")})
            except Exception as error:
                self.send({"type": "preview.response", "id": request_id, "status": 502, "headers": [["content-type", "text/plain; charset=utf-8"]], "body": base64.b64encode(str(error).encode()[:512]).decode("ascii")})
            finally:
                if connection:
                    connection.close()
                self.preview_slots.release()

        threading.Thread(target=forward, daemon=True).start()

    def scan(self, force=False):
        with self.lock:
            manifest, changed, total = {}, [], 0
            for directory, folders, names in os.walk(ROOT, followlinks=False):
                folders[:] = sorted(p for p in folders if not excluded_name(p) and not Path(directory, p).is_symlink())
                for name in folders + sorted(names):
                    if excluded_name(name):
                        continue
                    path = Path(directory, name)
                    if path.is_symlink():
                        continue
                    relative = path.relative_to(ROOT).as_posix()
                    if len(manifest) >= MAX_FILES:
                        raise ValueError("Workspace exceeds 1,000 source files; exclude generated outputs")
                    if path.is_dir():
                        item = {"path": relative, "kind": "folder", "hash": "", "content": ""}
                    else:
                        stat = path.stat()
                        if stat.st_size > MAX_FILE:
                            raise ValueError(f"Cannot back up {relative}: file exceeds 1 MiB. Move large assets to object storage before stopping.")
                        total += stat.st_size
                        if total > MAX_TOTAL:
                            raise ValueError("Workspace source files exceed the 8 MiB snapshot limit")
                        cache_key = (stat.st_mtime_ns, stat.st_size)
                        cached = self.cache.get(relative)
                        if cached and cached[0] == cache_key:
                            item = cached[1]
                        else:
                            raw = path.read_bytes()
                            try:
                                content = raw.decode("utf-8")
                            except UnicodeDecodeError:
                                raise ValueError(f"Cannot back up binary file {relative}. Move assets to object storage before stopping.")
                            if "\x00" in content:
                                raise ValueError(f"Cannot back up binary file {relative}. Move assets to object storage before stopping.")
                            item = {"path": relative, "kind": "file", "hash": hashlib.sha256(raw).hexdigest(), "content": content}
                            self.cache[relative] = (cache_key, item)
                    manifest[relative] = item["hash"] + item["kind"]
                    if force or self.previous.get(relative) != manifest[relative]:
                        changed.append(item)
            deleted = list(self.previous.keys() - manifest.keys())
            if force or changed or deleted:
                self.send({"type": "files.changed", "files": changed, "deleted": deleted, "full": force})
            self.previous = manifest
            self.cache = {key: value for key, value in self.cache.items() if key in manifest}

    def environment(self):
        blocked = ("RUNLY_", "OPENAI_", "CODEX_", "SUPABASE_", "STRIPE_", "GITHUB_", "AWS_", "GOOGLE_")
        return {key: value for key, value in os.environ.items() if not key.startswith(blocked) and key != "GH_TOKEN"}

    def open_terminal(self, cols=100, rows=24):
        if self.terminal and self.terminal.poll() is None:
            return
        import pty
        master, slave = pty.openpty()
        self.master = master
        # The child establishes its own controlling terminal without preexec_fn
        # (unsafe in a multithreaded connector).
        import sys
        bootstrap = "import os,fcntl,termios; os.setsid(); fcntl.ioctl(0,termios.TIOCSCTTY,0); os.execv('/bin/bash',['bash','--noprofile','--norc'])"
        self.terminal = subprocess.Popen([sys.executable, "-c", bootstrap], cwd=ROOT, stdin=slave, stdout=slave, stderr=slave, env={**self.environment(), "TERM": "xterm-256color", "PS1": "$ "})
        os.close(slave)
        self.resize(cols, rows)
        def read():
            try:
                while True:
                    data = os.read(master, 16384)
                    if not data:
                        break
                    self.send({"type": "terminal.output", "data": base64.b64encode(data).decode()})
            except OSError:
                pass
            finally:
                os.close(master)
                self.send({"type": "terminal.exit"})
        threading.Thread(target=read, daemon=True).start()

    def resize(self, cols, rows):
        import fcntl
        import struct
        import termios
        if self.master is not None:
            fcntl.ioctl(self.master, termios.TIOCSWINSZ, struct.pack("HHHH", max(1, min(int(rows), 200)), max(1, min(int(cols), 400)), 0, 0))

    def stop_app(self):
        if self.app and self.app.poll() is None:
            os.killpg(self.app.pid, signal.SIGTERM)
            try:
                self.app.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(self.app.pid, signal.SIGKILL)

    def git(self, message):
        action = message.get("action")
        branch = message.get("branch", "")
        url = message.get("url", "")
        token = message.get("token", "")
        if action not in {"status", "link", "restore", "checkout", "branch", "pull", "push"}:
            raise ValueError("Unknown Git action")
        if action != "status" and (not isinstance(branch, str) or not GIT_BRANCH.fullmatch(branch)):
            raise ValueError("Invalid Git branch")
        if action != "status" and (not isinstance(url, str) or not GITHUB_URL.fullmatch(url)):
            raise ValueError("Only GitHub repositories are supported")
        if action != "status" and (not isinstance(token, str) or len(token) > 4096 or len(token) < 20):
            raise ValueError("GitHub authorization is missing")
        auth = base64.b64encode(("x-access-token:" + token).encode()).decode() if token else ""
        env = {**self.environment(), "GIT_TERMINAL_PROMPT": "0", "GIT_CONFIG_NOSYSTEM": "1"}
        if auth:
            env.update({"GIT_CONFIG_COUNT": "1", "GIT_CONFIG_KEY_0": "http.https://github.com/.extraheader", "GIT_CONFIG_VALUE_0": "AUTHORIZATION: basic " + auth})
        def run(*args, timeout=90, check=True):
            result = subprocess.run(["git", *args], cwd=ROOT, env=env, capture_output=True, text=True, timeout=timeout)
            if check and result.returncode:
                # Never echo credentials or raw remote errors to the browser.
                raise ValueError("Git operation failed. Check repository access, branch protection, and the workspace state.")
            return result
        initialized = (ROOT / ".git").exists()
        if action == "status":
            if not initialized:
                return {"initialized": False, "branch": None, "branches": [], "dirty": False}
            current = run("branch", "--show-current").stdout.strip()
            branches = run("branch", "--format=%(refname:short)").stdout.splitlines()
            dirty = bool(run("status", "--porcelain").stdout.strip())
            return {"initialized": True, "branch": current, "branches": branches, "dirty": dirty}
        if not initialized:
            tracked = [item for item in ROOT.iterdir() if item.name not in {".git", ".runly"}]
            remote_heads = run("ls-remote", "--heads", url, timeout=90).stdout.strip()
            if tracked and remote_heads and action == "link":
                raise ValueError("This project already has files. Import this non-empty repository into a new blank project instead.")
            if not tracked and remote_heads and action == "link":
                run("clone", "--depth", "1", "--branch", branch, url, ".", timeout=120)
            else:
                run("init", "-b", branch)
                run("remote", "add", "origin", url)
                if remote_heads:
                    available = {line.split("refs/heads/", 1)[1] for line in remote_heads.splitlines() if "refs/heads/" in line}
                    target = branch
                    if target not in available:
                        head = run("ls-remote", "--symref", url, "HEAD", timeout=90).stdout
                        match = re.search(r"^ref: refs/heads/([^\s]+)\s+HEAD$", head, re.MULTILINE)
                        target = match.group(1) if match else sorted(available)[0]
                    run("fetch", "--depth", "1", "origin", target, timeout=120)
                    # A mixed reset restores the index without overwriting saved workspace files.
                    run("reset", "--mixed", "FETCH_HEAD")
            initialized = True
        remote = run("remote", "get-url", "origin").stdout.strip()
        if remote != url:
            raise ValueError("The workspace is connected to a different repository")
        current_branch = run("branch", "--show-current").stdout.strip()
        if action in ("pull", "push") and current_branch != branch:
            raise ValueError("Workspace branch changed outside Runly. Refresh Git status before continuing.")
        exclude = ROOT / ".git" / "info" / "exclude"
        if exclude.exists():
            existing = exclude.read_text()
            ignore = "\nnode_modules/\n.next/\ndist/\nbuild/\n.cache/\n.venv/\n.runly/\n"
            if ignore not in existing:
                exclude.write_text(existing + ignore)
        if action in ("link", "restore"):
            self.scan(force=True)
        elif action == "checkout":
            if run("status", "--porcelain").stdout.strip():
                raise ValueError("Save or push local changes before switching branches")
            self.stop_app()
            run("fetch", "--depth", "1", "origin", "+refs/heads/" + branch + ":refs/remotes/origin/" + branch, timeout=120)
            if run("show-ref", "--verify", "refs/heads/" + branch, check=False).returncode == 0:
                run("switch", branch)
            else:
                run("switch", "-c", branch, "--track", "origin/" + branch)
            self.scan(force=True)
        elif action == "branch":
            if run("status", "--porcelain").stdout.strip():
                raise ValueError("Save or push local changes before creating a branch")
            run("switch", "-c", branch)
        elif action == "pull":
            if run("status", "--porcelain").stdout.strip():
                raise ValueError("Push or discard local changes before pulling")
            self.stop_app()
            run("pull", "--ff-only", "origin", branch, timeout=120)
            self.scan(force=True)
        elif action == "push":
            author = message.get("author", "")
            email = message.get("email", "")
            title = message.get("message", "")
            if not isinstance(author, str) or not 1 <= len(author) <= 120 or not isinstance(email, str) or not 3 <= len(email) <= 254 or not isinstance(title, str) or not 1 <= len(title) <= 120:
                raise ValueError("A commit author and message are required")
            run("add", "-A")
            if run("diff", "--cached", "--quiet", check=False).returncode != 0:
                run("-c", "user.name=" + author, "-c", "user.email=" + email, "commit", "-m", title)
            run("push", "-u", "origin", branch, timeout=120)
        result = self.git({"action": "status"})
        result["commit"] = run("rev-parse", "HEAD", check=False).stdout.strip() or None
        return result

    def handle(self, message):
        operation = message.get("op")
        request_id = message.get("id")
        try:
            with self.lock:
                result = {}
                if operation in ("write", "mkdir", "rename", "delete"):
                    path = safe_path(message.get("path"))
                    if operation in ("write", "rename", "delete") and message.get("hash", "") != file_hash(path):
                        raise ValueError("File changed in the sandbox. Reload it before saving.")
                    if operation == "write":
                        content = message.get("content", "")
                        if not isinstance(content, str) or "\x00" in content or len(content.encode()) > MAX_FILE:
                            raise ValueError("File exceeds 1 MiB")
                        if message.get("create") and path.exists():
                            raise ValueError("An item already exists at this path")
                        # Reject quota violations before replacing the file.
                        source_files = []
                        for directory, folders, names in os.walk(ROOT, followlinks=False):
                            folders[:] = [name for name in folders if not excluded_name(name) and not Path(directory, name).is_symlink()]
                            source_files.extend(Path(directory, name) for name in folders + names if not excluded_name(name) and not Path(directory, name).is_symlink())
                        if sum(p.stat().st_size for p in source_files if p.is_file() and p != path) + len(content.encode()) > MAX_TOTAL:
                            raise ValueError("Workspace source files exceed the 8 MiB snapshot limit")
                        missing_parents = [p for p in path.parents if p.is_relative_to(ROOT) and not p.exists()]
                        if len(source_files) + len(missing_parents) + (not path.exists()) > MAX_FILES:
                            raise ValueError("Workspace exceeds 1,000 source files")
                        path.parent.mkdir(parents=True, exist_ok=True)
                        temporary = path.with_name(f".runly-{uuid.uuid4().hex}.tmp")
                        temporary.write_bytes(content.encode("utf-8"))
                        temporary.replace(path)
                        result = {"hash": file_hash(path)}
                    elif operation == "mkdir":
                        path.mkdir(parents=True, exist_ok=False)
                    elif operation == "rename":
                        destination = safe_path(message.get("to"))
                        if destination.exists():
                            raise ValueError("An item already exists at the destination")
                        destination.parent.mkdir(parents=True, exist_ok=True)
                        path.rename(destination)
                    elif operation == "delete":
                        path.unlink()  # File-only: never recursively deletes directories.
                    self.scan()
                elif operation == "read":
                    path = safe_path(message.get("path"))
                    if path.stat().st_size > MAX_FILE:
                        raise ValueError("File exceeds 1 MiB")
                    result = {"content": path.read_text(encoding="utf-8"), "hash": file_hash(path)}
                elif operation == "snapshot":
                    self.scan(force=True)
                elif operation == "terminal.open":
                    self.open_terminal(message.get("cols", 100), message.get("rows", 24))
                elif operation == "terminal.input":
                    if self.master is None or not self.terminal or self.terminal.poll() is not None:
                        raise ValueError("Open the terminal first")
                    data = message.get("data", "")
                    if not isinstance(data, str) or len(data) > 16384:
                        raise ValueError("Terminal input is too large")
                    os.write(self.master, data.encode())
                elif operation == "terminal.resize":
                    self.resize(message.get("cols", 100), message.get("rows", 24))
                elif operation == "app.start":
                    command = message.get("command", "npm run dev")
                    if not isinstance(command, str) or not command.strip() or len(command) > 2000:
                        raise ValueError("Invalid run command")
                    if self.app and self.app.poll() is None:
                        raise ValueError("An application is already running. Stop it first.")
                    app_environment = {
                        **self.environment(),
                        "HOST": "0.0.0.0",
                        "HOSTNAME": "0.0.0.0",
                        "PORT": "3000",
                    }
                    self.app = subprocess.Popen(["/bin/bash", "-lc", command], cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, start_new_session=True, env=app_environment)
                    process = self.app
                    self.preview_ready = False
                    self.send({"type": "app.status", "running": True, "previewUrl": None})
                    def wait_for_preview():
                        import socket
                        for _ in range(180):
                            if process.poll() is not None or not self.alive:
                                return
                            try:
                                with socket.create_connection(("127.0.0.1", 3000), timeout=1):
                                    self.preview_ready = True
                                    preview_url = os.environ.get("RUNLY_PREVIEW_URL")
                                    status = {"type": "app.status", "running": True, "previewUrl": preview_url}
                                    if not preview_url:
                                        status.update({"error": "This workspace session has no Preview address. Restart the workspace to enable Preview.", "restartRequired": True})
                                    self.send(status)
                                    return
                            except OSError:
                                time.sleep(1)
                        if process.poll() is None and self.alive:
                            self.stop_app()
                            self.send({"type": "app.status", "running": False, "previewUrl": None, "error": "The app did not open port 3000 within three minutes. Check Console for startup errors."})
                    threading.Thread(target=wait_for_preview, daemon=True).start()
                    def output():
                        while True:
                            data = os.read(process.stdout.fileno(), 16384)
                            if not data:
                                break
                            self.send({"type": "console.output", "data": data.decode("utf-8", errors="replace")})
                        code = process.wait()
                        process.stdout.close()
                        was_preview_ready = self.preview_ready
                        self.preview_ready = False
                        status = {"type": "app.status", "running": False, "previewUrl": None, "exitCode": code}
                        if not was_preview_ready and code != 0:
                            status["error"] = f"The app exited with code {code} before Preview was ready. Check Console for startup errors."
                        self.send(status)
                    threading.Thread(target=output, daemon=True).start()
                elif operation == "app.stop":
                    self.stop_app()
                elif operation == "git":
                    result = self.git(message)
                else:
                    raise ValueError("Unknown workspace operation")
            self.send({"type": "reply", "id": request_id, "result": result})
        except Exception as error:
            self.send({"type": "reply", "id": request_id, "error": str(error)[:300]})


def main():
    import websocket
    ROOT.mkdir(parents=True, exist_ok=True)
    output_lock = threading.Lock()
    socket = None
    def send(value):
        with output_lock:
            if socket and socket.sock and socket.sock.connected:
                try:
                    socket.send(json.dumps(value, ensure_ascii=False))
                except (OSError, websocket.WebSocketException):
                    pass
    bridge = Bridge(send)
    def on_open(ws):
        ws.send(json.dumps({"type": "auth", "role": "bridge", "project": os.environ["RUNLY_PROJECT_ID"], "generation": os.environ["RUNLY_GENERATION"], "token": os.environ["RUNLY_BRIDGE_TOKEN"]}))
    def on_message(ws, data):
        message = json.loads(data)
        if message.get("type") == "authenticated":
            bridge.scan(force=True)
            running = bool(bridge.app and bridge.app.poll() is None)
            preview_url = os.environ.get("RUNLY_PREVIEW_URL") if running and bridge.preview_ready else None
            status = {"type": "app.status", "running": running, "previewUrl": preview_url}
            if running and bridge.preview_ready and not preview_url:
                status.update({"error": "This workspace session has no Preview address. Restart the workspace to enable Preview.", "restartRequired": True})
            bridge.send(status)
        elif message.get("type") == "command":
            if not bridge.command_slots.acquire(blocking=False):
                bridge.send({"type": "reply", "id": message.get("id"), "error": "Workspace is busy. Retry shortly."})
            else:
                def execute_command():
                    try:
                        bridge.handle(message)
                    finally:
                        bridge.command_slots.release()
                threading.Thread(target=execute_command, daemon=True).start()
        elif message.get("type") == "preview.request":
            bridge.handle_preview_request(message)
    def on_error(ws, error):
        print(f"Gateway WebSocket error: {error}", flush=True)
    def on_close(ws, code, reason):
        print(f"Gateway WebSocket closed ({code}): {reason or 'no reason'}", flush=True)
    def watch():
        while bridge.alive:
            time.sleep(2)
            try:
                bridge.scan()
            except Exception as error:
                send({"type": "workspace.warning", "message": str(error)[:300]})
    threading.Thread(target=watch, daemon=True).start()
    while bridge.alive:
        socket = websocket.WebSocketApp(
            os.environ["RUNLY_GATEWAY_URL"],
            on_open=on_open,
            on_message=on_message,
            on_error=on_error,
            on_close=on_close,
        )
        # The gateway owns the heartbeat and pings every peer. Keeping a second
        # independent client ping loop can cause needless reconnect churn.
        socket.run_forever()
        time.sleep(3)


if __name__ == "__main__":
    main()
