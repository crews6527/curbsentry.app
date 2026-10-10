"""Connection lifetime checks also catch Windows file locks on Linux."""
import io
from pathlib import Path
import sqlite3
import tempfile
import threading
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch
import zipfile

from curbsentry.server import Handler
from curbsentry.storage import Store
from restore_backup import restore


class BackupLifecycleTests(unittest.TestCase):
    def assert_closed(self, connections):
        self.assertTrue(connections)
        for connection in connections:
            with self.assertRaises(sqlite3.ProgrammingError):
                connection.execute("SELECT 1")

    def tracking(self, connections):
        original = sqlite3.connect
        def connect(*args, **kwargs):
            connection = original(*args, **kwargs)
            connections.append(connection)
            return connection
        return patch("sqlite3.connect", side_effect=connect)

    def test_export_closes_connections_before_stream_and_cleanup(self):
        with tempfile.TemporaryDirectory() as folder:
            store = Store(folder)
            handler = Handler.__new__(Handler)
            handler.server = SimpleNamespace(store=store, backup_lock=threading.Lock())
            connections, payload = [], []
            def stream(path):
                self.assert_closed(connections)
                payload.append(path.read_bytes())
            handler.stream = stream
            with self.tracking(connections):
                handler.backup()
            self.assert_closed(connections)
            self.assertEqual({p.name for p in Path(folder).iterdir()}, {"media", "backups", "curbsentry.sqlite3"})
            with zipfile.ZipFile(io.BytesIO(payload[0])) as archive:
                self.assertIsNone(archive.testzip())
                self.assertEqual(archive.namelist(), ["curbsentry.sqlite3"])

    def test_rotated_snapshot_connections_are_all_closed(self):
        with tempfile.TemporaryDirectory() as folder:
            store = Store(folder)
            connections = []
            with self.tracking(connections):
                for _ in range(12):
                    store.backup_database()
            self.assert_closed(connections)
            self.assertEqual(len(list((Path(folder)/"backups").glob("*.sqlite3"))), 10)

    def test_restore_closes_validation_connection_and_preserves_data(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)/"data"
            store = Store(root)
            backup = Path(folder)/"backup.zip"
            with zipfile.ZipFile(backup, "w") as archive:
                archive.write(store.path, "curbsentry.sqlite3")
            connections = []
            with self.tracking(connections):
                preserved = restore(backup, root)
            self.assert_closed(connections)
            self.assertTrue((preserved/"curbsentry.sqlite3").is_file())
            self.assertTrue(store.path.is_file())


class ResponseLifecycleTests(unittest.TestCase):
    def handler(self, path="/api/state"):
        handler = Handler.__new__(Handler)
        handler.path = path
        handler.allowed_request = Mock()
        handler.role = Mock(return_value="owner")
        handler.server = SimpleNamespace(store=Mock())
        handler.server.store.snapshot.return_value = {}
        handler.tools = Mock(return_value={})
        return handler

    def test_aborted_connection_does_not_receive_another_response(self):
        handler = self.handler()
        handler.send_bytes = Mock(side_effect=ConnectionAbortedError("simulated Windows 10053"))
        handler.dispatch("GET")
        self.assertEqual(handler.send_bytes.call_count, 1)

    def test_cleanup_failure_after_response_does_not_send_json_again(self):
        handler = self.handler("/api/backup")
        def backup():
            handler.response_started = True
            raise PermissionError("simulated cleanup failure after sending backup")
        handler.backup = backup
        handler.send_bytes = Mock()
        handler.dispatch("GET")
        handler.send_bytes.assert_not_called()


if __name__ == "__main__":
    unittest.main()
