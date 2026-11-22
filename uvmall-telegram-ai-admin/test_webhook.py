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


class WebhookStatusTests(unittest.TestCase):
    def setUp(self):
        with app.LOCK:
            self.before_webhook = dict(app.WEBHOOK_STATUS)
            self.before_menu = dict(app.MENU_STATUS)
            app.WEBHOOK_STATUS.update({"state": "pending", "checked_at": None, "registered_at": None})
            app.MENU_STATUS["state"] = "pending"

    def tearDown(self):
        with app.LOCK:
            app.WEBHOOK_STATUS.clear()
            app.WEBHOOK_STATUS.update(self.before_webhook)
            app.MENU_STATUS.clear()
            app.MENU_STATUS.update(self.before_menu)

    def test_missing_token_is_not_reported_as_online(self):
        with patch.object(app, "TOKEN", ""), patch.object(app, "tg") as telegram:
            app.register_webhook()
        self.assertEqual(app.WEBHOOK_STATUS["state"], "token_missing")
        telegram.assert_not_called()

    def test_missing_webhook_config_is_visible(self):
        with (patch.object(app, "TOKEN", "example-token"),
              patch.object(app, "WEBHOOK_SECRET", ""),
              patch.object(app, "PUBLIC_URL", "https://test.example")):
            app.register_webhook()
        self.assertEqual(app.WEBHOOK_STATUS["state"], "webhook_configuration_missing")

    def test_registration_and_website_menu_have_separate_status(self):
        sent = []
        def telegram(method, **data):
            sent.append((method, data))
            if method == "getMe":
                return {"username": "uv_mallbot"}
            if method == "getMyName":
                return {"name": "UVMALL AI — Помощник"}
            return True
        with (patch.object(app, "TOKEN", "example-token"),
              patch.object(app, "WEBHOOK_SECRET", "example-secret"),
              patch.object(app, "PUBLIC_URL", "https://example.org"),
              patch.object(app, "MANAGER_ID", 0),
              patch.object(app, "tg", side_effect=telegram)):
            app.register_webhook()
        self.assertEqual(app.WEBHOOK_STATUS["state"], "registered")
        self.assertGreater(app.WEBHOOK_STATUS["registered_at"], 0)
        self.assertEqual(app.MENU_STATUS["state"], "configured")
        menus = [args for method, args in sent if method == "setChatMenuButton"]
        self.assertEqual(menus[0]["menu_button"]["web_app"]["url"], app.SITE)
        self.assertEqual(len([m for m, _ in sent if m == "setWebhook"]), 1)

    def test_menu_failure_does_not_hide_registered_webhook(self):
        def telegram(method, **_data):
            if method == "getMe":
                return {"username": "uv_mallbot"}
            if method == "getMyName":
                return {"name": "UVMALL AI — Помощник"}
            if method == "setChatMenuButton":
                raise RuntimeError("temporary telegram error")
            return True
        with (patch.object(app, "TOKEN", "example-token"),
              patch.object(app, "WEBHOOK_SECRET", "example-secret"),
              patch.object(app, "PUBLIC_URL", "https://example.org"),
              patch.object(app, "MANAGER_ID", 0),
              patch.object(app, "tg", side_effect=telegram)):
            app.register_webhook()
        self.assertEqual(app.WEBHOOK_STATUS["state"], "registered")
        self.assertEqual(app.MENU_STATUS["state"], "failed")

    def test_temporary_registration_failure_retries(self):
        attempts = []
        def simulate():
            attempts.append(1)
            app.set_webhook_state("registration_failed" if len(attempts) == 1 else "registered", registered=len(attempts) > 1)
            if len(attempts) > 1:
                app.MENU_STATUS["state"] = "configured"
        with (patch.object(app, "register_webhook", side_effect=simulate),
              patch.object(app.time, "sleep") as sleep):
            app.register_webhook_with_retries()
        self.assertEqual(len(attempts), 2)
        sleep.assert_called_once_with(15)

    def test_permanent_configuration_error_does_not_retry(self):
        attempts = []
        def simulate():
            attempts.append(1)
            app.set_webhook_state("bot_identity_mismatch")
        with (patch.object(app, "register_webhook", side_effect=simulate),
              patch.object(app.time, "sleep") as sleep):
            app.register_webhook_with_retries()
        self.assertEqual(len(attempts), 1)
        sleep.assert_not_called()

    def test_temporary_menu_failure_retries_even_after_webhook_registered(self):
        attempts = []
        def simulate():
            attempts.append(1)
            app.set_webhook_state("registered", registered=True)
            app.MENU_STATUS["state"] = "failed" if len(attempts) == 1 else "configured"
        with (patch.object(app, "register_webhook", side_effect=simulate),
              patch.object(app.time, "sleep") as sleep):
            app.register_webhook_with_retries()
        self.assertEqual(len(attempts), 2)
        sleep.assert_called_once_with(15)


if __name__ == "__main__":
    unittest.main()
