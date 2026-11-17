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
