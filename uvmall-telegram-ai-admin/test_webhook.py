"""Regression tests for Telegram webhook retry and deduplication."""
import unittest
from unittest.mock import patch

import app


class WebhookRetryTests(unittest.TestCase):
    def setUp(self):
        with app.LOCK:
            self.previous_seen = app.SEEN.copy()
            self.previous_inflight = app.PROCESSING.copy()
            app.SEEN.clear()
            app.PROCESSING.clear()
        self.update = {"update_id": 987654321,
                       "message": {"chat": {"id": 123}, "from": {"id": 123},
                                   "text": "test"}}

    def tearDown(self):
        with app.LOCK:
            app.SEEN.clear()
            app.SEEN.update(self.previous_seen)
            app.PROCESSING.clear()
            app.PROCESSING.update(self.previous_inflight)

    def test_successful_update_is_processed_once(self):
        with patch.object(app, "process_message") as handler:
            app.handle_update(self.update)
            app.handle_update(self.update)
        handler.assert_called_once()

    def test_failed_update_remains_retryable(self):
        with patch.object(app, "process_message",
                          side_effect=[RuntimeError("temporary"), None]) as handler:
            with self.assertRaisesRegex(RuntimeError, "temporary"):
                app.handle_update(self.update)
            self.assertNotIn(self.update["update_id"], app.SEEN)
            self.assertNotIn(self.update["update_id"], app.PROCESSING)
            app.handle_update(self.update)
        self.assertEqual(handler.call_count, 2)
        self.assertIn(self.update["update_id"], app.SEEN)

    def test_concurrent_duplicate_is_not_acknowledged_prematurely(self):
        def handle(_message, _business):
            with self.assertRaisesRegex(RuntimeError, "already in progress"):
                app.handle_update(self.update)
        with patch.object(app, "process_message", side_effect=handle) as handler:
            app.handle_update(self.update)
        handler.assert_called_once()
        self.assertIn(self.update["update_id"], app.SEEN)
        self.assertNotIn(self.update["update_id"], app.PROCESSING)

    def test_menu_button_opens_official_marketplace(self):
        self.assertEqual(app.MENU_BUTTON["type"], "web_app")
        self.assertEqual(app.MENU_BUTTON["web_app"]["url"], "https://uvmall.ru/")


if __name__ == "__main__":
    unittest.main()
