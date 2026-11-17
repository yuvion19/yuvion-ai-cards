"""Tests against synthetic records; synthetic data never reaches production."""
import json
import unittest
import catalog as c

class CatalogTests(unittest.TestCase):
    def setUp(self):
        with c.LOCK:
            c.PRODUCTS.clear()
            c.STATUS.update({"source":"not_connected","count":0,"last_sync":None,"last_attempt":None,"error":None})
    def tearDown(self):
        with c.LOCK:
            c.PRODUCTS.clear()
            c.STATUS.update({"source":"not_connected","count":0})
    def test_no_fake_items(self):
        self.assertFalse(c.search("чайник")["products"])
        self.assertFalse(c.search("чайник")["connected"])
    def test_reject_untrusted_urls(self):
        self.assertIsNone(c.normalize({"id":"a","title":"Чайник 3 литра","url":"https://evil.invalid/products/1"},0))
        self.assertEqual(c.https_url("javascript:alert(1)"),"")
    def test_feed_and_search(self):
        rows=[
          {"id":"k-1","title":"Электрочайник 1.7 литра","url":"https://uvmall.ru/products/k-1",
           "price":"1 990 ₽","wholesale_price":"1700","min_qty":10,
           "seller":"Магазин 14","category":"Бытовая техника","quantity":"70"},
          {"id":"t-1","title":"Полотенце хлопковое","url":"https://uvmall.ru/products/t-1",
           "price":"550 ₽","category":"Текстиль"}]
        self.assertEqual(c.install(rows,"test"),2)
        d=c.search("электрочайник",max_price=2000,qty=10)
        self.assertEqual(d["total"],1)
        self.assertEqual(d["products"][0]["display_price"],1700)
        self.assertEqual(c.search("полотенце",category="Бытовая техника")["total"],0)
        self.assertEqual(c.get("k-1")["seller"],"Магазин 14")
        self.assertEqual(c.all_categories(),["Бытовая техника","Текстиль"])
    def test_parse(self):
        data=c.parse_natural("Электрочайник до 2000 ₽ оптом от 10 шт")
        self.assertEqual(c.as_number(data["max_price"]),2000)
        self.assertEqual(data["qty"],"10")
    def test_feed_json(self):
        rows=c.decode_feed(json.dumps({"products":[{"title":"Кружка","url":"/product/2"}]}).encode())
        self.assertEqual(rows[0]["title"],"Кружка")
    def test_unavailable_qty(self):
        rows=[{"id":"q1","title":"Набор посуды","url":"https://uvmall.ru/p/1","price":1999}]
        c.install(rows,"test")
        self.assertEqual(c.search("набор",max_price="1000")["total"],0)

if __name__=="__main__":
    unittest.main()
