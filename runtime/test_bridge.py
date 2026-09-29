import base64
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

    def test_paths_and_no_recursive_delete(self):
        for value in ["../escape", "/etc/passwd", "a/../../escape", "a//b", "a\\b", "C:/x", "a/.git/config", ".runly/x"]:
            self.assertIn("error", self.command("write", path=value, content="x", hash=""))
        self.command("mkdir", path="folder")
        self.assertIn("error", self.command("delete", path="folder", hash=""))
        self.assertTrue((bridge.ROOT / "folder").is_dir())

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
