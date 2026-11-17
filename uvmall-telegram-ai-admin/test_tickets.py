"""UVMALL AI ticket tests use temp directories; never affect live customer records."""
import os
import tempfile
import unittest
import tickets

class TicketTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.previous=tickets.DB_PATH
        tickets.DB_PATH=os.path.join(self.temp.name,"tickets.db")
        tickets.initialize()
    def tearDown(self):
        tickets.DB_PATH=self.previous
        self.temp.cleanup()
    def test_unique_ids_across_ephemeral_db_resets(self):
        old=tickets.create("support",123,"Before reboot","k1")
        self.assertGreaterEqual(old["id"],100_000_000_000)
        # Simulate an erased or replaced Render ephemeral volume.
        tickets.DB_PATH=os.path.join(self.temp.name,"replacement.db")
        tickets.initialize()
        fresh=tickets.create("support",456,"After reboot","k2")
        self.assertNotEqual(old["id"],fresh["id"])
        self.assertIsNone(tickets.get(old["id"]))

    def test_deduplicates_requests(self):
        t=tickets.create("support",12345,"Need help","msg:12345:1")
        same=tickets.create("support",12345,"Need help","msg:12345:1")
        self.assertEqual(t["id"],same["id"])
        self.assertEqual(tickets.statistics()["total"],1)
    def test_transition_and_reply(self):
        t=tickets.create("wholesale",12345,"200 pots","rfq:12345:2")
        tickets.notify(t["id"])
        self.assertEqual(tickets.get(t["id"])["notified"],1)
        replied=tickets.mark_replied(t["id"])
        self.assertEqual(replied["status"],"in_progress")
        tickets.transition(t["id"],"closed")
        self.assertEqual(tickets.statistics()["closed"],1)
        self.assertEqual(tickets.statistics()["replies"],1)
    def test_list_filter(self):
        a=tickets.create("seller",12,"Store","seller:12:9")
        b=tickets.create("support",13,"Question","support:13:9")
        tickets.transition(b["id"],"resolved")
        self.assertEqual(len(tickets.list_tickets("new")),1)
        self.assertEqual(len(tickets.list_tickets("all")),2)
    def test_locale_and_feedback(self):
        self.assertEqual(tickets.get_language(123),"ru")
        tickets.set_language(123,"tg")
        self.assertEqual(tickets.get_language(123),"tg")
        with self.assertRaises(ValueError):
            tickets.set_language(123,"unsupported")
        self.assertTrue(tickets.record_feedback(123,42,True))
        self.assertFalse(tickets.record_feedback(123,42,False))
        self.assertTrue(tickets.record_feedback(123,43,False))
        self.assertEqual(tickets.metrics()["helpful_yes"],1)
        self.assertEqual(tickets.metrics()["helpful_no"],1)

    def test_ai_quota(self):
        self.assertTrue(tickets.allow_ai(123,limit=2))
        self.assertTrue(tickets.allow_ai(123,limit=2))
        self.assertFalse(tickets.allow_ai(123,limit=2))
        self.assertTrue(tickets.allow_ai(124,limit=2))

    def test_anonymous_metrics(self):
        tickets.metric("search")
        tickets.metric("search")
        tickets.metric("search_empty")
        result=tickets.metrics()
        self.assertEqual(result["search"],2)
        self.assertEqual(result["search_empty"],1)
        with self.assertRaises(ValueError):
            tickets.metric("include_customer_id")
    def test_prune_old_resolved_only(self):
        a=tickets.create("support",11,"Closed","old:1")
        b=tickets.create("support",12,"Open","old:2")
        tickets.transition(a["id"],"closed")
        with tickets.LOCK, tickets._connect() as db:
            db.execute("UPDATE tickets SET updated_at=1 WHERE id IN (?,?)",(a["id"],b["id"]))
        self.assertEqual(tickets.prune_history(),1)
        self.assertIsNotNone(tickets.get(b["id"]))
        self.assertIsNone(tickets.get(a["id"]))

    def test_no_sql_injection(self):
        t=tickets.create("support",33,"A message","key:33")
        with self.assertRaises(ValueError):
            tickets.transition(t["id"],"closed'; DROP TABLE tickets;--")
        self.assertEqual(tickets.statistics()["total"],1)
    def test_requires_identity(self):
        with self.assertRaises(ValueError):
            tickets.create("support",0,"No user","msg:1")
        with self.assertRaises(ValueError):
            tickets.create("bad",12,"No user","msg:2")

if __name__=="__main__":
    unittest.main()
