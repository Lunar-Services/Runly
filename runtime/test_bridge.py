import base64
import hashlib
import os
import signal
from pathlib import Path
import tempfile
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import threading
import unittest
from unittest.mock import patch
import bridge


class BridgeTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = patch.object(bridge, "ROOT", Path(self.directory.name).resolve())
        self.root.start()
        self.frames = []
        self.connector = bridge.Bridge(self.frames.append)

    def tearDown(self):
        self.connector.stop_app()
        if self.connector.terminal and self.connector.terminal.poll() is None:
            os.killpg(self.connector.terminal.pid, signal.SIGKILL)
            self.connector.terminal.wait(timeout=5)
        self.root.stop()
        self.directory.cleanup()

    def command(self, op, **fields):
        self.connector.handle({"op": op, "id": "test", **fields})
        return next(f for f in reversed(self.frames) if f["type"] == "reply")

    def test_file_lifecycle_and_conflict(self):
        first = self.command("write", path="src/a.ts", content="one\n", hash="", create=True)
        self.assertNotIn("error", first)
        self.assertIn("error", self.command("write", path="src/a.ts", content="bad", hash=""))
        self.assertEqual((bridge.ROOT / "src/a.ts").read_text(), "one\n")
        self.assertNotIn("error", self.command("rename", path="src/a.ts", to="b.ts", hash=first["result"]["hash"]))
        self.assertFalse((bridge.ROOT / "src/a.ts").exists())
        self.assertNotIn("error", self.command("delete", path="b.ts", hash=first["result"]["hash"]))
        self.assertFalse((bridge.ROOT / "b.ts").exists())

    def test_repository_replacement_checks_current_files_before_changing_them(self):
        self.command("write", path="old.txt", content="original", hash="")
        self.command("snapshot")
        baseline = next(f for f in reversed(self.frames) if f["type"] == "files.changed")["files"]
        content = "replacement"
        target = [{"path": "new.txt", "kind": "file", "content": content,
                   "hash": hashlib.sha256(content.encode()).hexdigest()}]
        self.assertIn("error", self.command("replace", expected=[], files=target))
        self.assertEqual((bridge.ROOT / "old.txt").read_text(), "original")
        self.assertNotIn("error", self.command("replace", expected=baseline, files=target))
        self.assertFalse((bridge.ROOT / "old.txt").exists())
        self.assertEqual((bridge.ROOT / "new.txt").read_text(), content)

    def test_paths_and_no_recursive_delete(self):
        for value in ["../escape", "/etc/passwd", "a/../../escape", "a//b", "a\\b", "C:/x", "a/.git/config", ".runly/x", ".env", "src/.env.local", "secrets/private.pem"]:
            self.assertIn("error", self.command("write", path=value, content="x", hash=""))
        self.command("mkdir", path="folder")
        self.assertIn("error", self.command("delete", path="folder", hash=""))
        self.assertTrue((bridge.ROOT / "folder").is_dir())

    def test_snapshot_excludes_secret_like_files(self):
        (bridge.ROOT / ".env.local").write_text("PRIVATE_TEST_VALUE=hidden")
        (bridge.ROOT / "public.txt").write_text("visible")
        self.command("snapshot")
        snapshot = next(f for f in reversed(self.frames) if f["type"] == "files.changed")
        self.assertEqual([item["path"] for item in snapshot["files"]], ["public.txt"])

    def test_child_processes_do_not_inherit_platform_keys(self):
        with patch.dict(os.environ, {"RUNLY_BRIDGE_TOKEN": "bridge", "CODEX_API_KEY": "executor", "OPENAI_API_KEY": "application", "GITHUB_TOKEN": "github", "SAFE_VALUE": "ok"}):
            child = self.connector.environment()
        self.assertEqual(child["SAFE_VALUE"], "ok")
        for name in ("RUNLY_BRIDGE_TOKEN", "CODEX_API_KEY", "OPENAI_API_KEY", "GITHUB_TOKEN"):
            self.assertNotIn(name, child)

    def test_utf8_hash_and_reconnect_snapshot(self):
        self.command("write", path="hello.txt", content="hello 🐱\n", hash="")
        result = self.command("read", path="hello.txt")["result"]
        self.assertEqual(result["content"], "hello 🐱\n")
        self.command("snapshot")
        snapshot = next(f for f in reversed(self.frames) if f["type"] == "files.changed")
        self.assertTrue(snapshot["full"])
        self.assertEqual(snapshot["files"][0]["hash"], result["hash"])

    def test_quota_rejects_before_overwriting(self):
        first = self.command("write", path="a", content="old", hash="")
        with patch.object(bridge, "MAX_TOTAL", 4):
            self.assertIn("error", self.command("write", path="a", content="longer", hash=first["result"]["hash"]))
        self.assertEqual((bridge.ROOT / "a").read_text(), "old")

    def test_unsupported_assets_block_destructive_shutdown_snapshot(self):
        (bridge.ROOT / "image.png").write_bytes(b"\x00\xff")
        self.assertIn("error", self.command("snapshot"))

    def test_preview_request_is_forwarded_to_workspace_app(self):
        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(201)
                self.send_header("Content-Type", "text/plain")
                self.end_headers()
                self.wfile.write(b"preview works")

            def log_message(self, *_args):
                pass

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()
        try:
            with patch.dict(os.environ, {"RUNLY_PREVIEW_PORT": str(server.server_address[1])}):
                self.connector.handle_preview_request({
                    "id": "preview-test",
                    "method": "GET",
                    "path": "/",
                    "headers": [],
                    "body": base64.b64encode(b"").decode(),
                })
            deadline = time.time() + 3
            while time.time() < deadline and not any(f.get("id") == "preview-test" for f in self.frames):
                time.sleep(0.01)
            frame = next(f for f in self.frames if f.get("id") == "preview-test")
            self.assertEqual(frame["type"], "preview.response")
            self.assertEqual(frame["status"], 201)
            self.assertEqual(base64.b64decode(frame["body"]), b"preview works")
        finally:
            server.shutdown()
            server.server_close()

    def test_git_credentials_cannot_be_forwarded_to_sandbox(self):
        reply = self.command("git", action="push", token="test-installation-token-123",
                             branch="main", url="https://github.com/example/repo.git")
        self.assertIn("error", reply)
        self.assertEqual(reply["error"], "Unknown workspace operation")
        self.assertNotIn("test-installation-token-123", str(self.frames))
        self.assertFalse((bridge.ROOT / ".git").exists())

    @unittest.skipIf(os.name == "nt", "Hosted terminal is Linux-only")
    def test_symlink_escape(self):
        (bridge.ROOT / "outside").symlink_to("/tmp", target_is_directory=True)
        self.assertIn("error", self.command("write", path="outside/escape.txt", content="x", hash=""))

    @unittest.skipIf(os.name == "nt", "Hosted terminal is Linux-only")
    def test_actual_pty_and_app_logs(self):
        self.assertNotIn("error", self.command("terminal.open", cols=100, rows=24))
        self.command("terminal.input", data="printf 'PTY_CHECK\\n'\n")
        self.assertNotIn("error", self.command("app.start", command="printf 'APP_CHECK\\n'"))
        deadline = time.time() + 5
        while time.time() < deadline:
            terminal = b"".join(base64.b64decode(f["data"]) for f in self.frames if f["type"] == "terminal.output")
            logs = "".join(f["data"] for f in self.frames if f["type"] == "console.output")
            if b"PTY_CHECK\r\n" in terminal and "APP_CHECK" in logs:
                break
            time.sleep(0.05)
        self.assertIn(b"PTY_CHECK\r\n", terminal)
        self.assertNotIn(b"no job control", terminal)
        self.assertIn("APP_CHECK", logs)


if __name__ == "__main__":
    unittest.main()
