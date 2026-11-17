"""Site status rules are intentionally cautious; do not assert global downtime."""
import unittest
import uptime

class UptimeTests(unittest.TestCase):
    def test_200_is_reachable(self):
        self.assertEqual(uptime.interpret(200),"reachable")
        self.assertEqual(uptime.interpret(302),"reachable")
    def test_503_is_local_failure(self):
        x={"http_status":503,"result":uptime.interpret(503)}
        self.assertEqual(x["result"],"server_error")
        self.assertIn("из сети сервера",uptime.public_text(x))
    def test_access_restriction_is_not_downtime(self):
        self.assertEqual(uptime.interpret(403),"access_restricted")
    def test_unknown(self):
        self.assertEqual(uptime.interpret(None),"unknown")
    def test_invalid_target(self):
        with self.assertRaises(ValueError):
            uptime.check_one("arbitrary")

if __name__=="__main__":
    unittest.main()
