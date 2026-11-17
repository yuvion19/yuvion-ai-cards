"""HMAC and RFQ tests; no real Telegram credentials or customer records."""
import hashlib
import hmac
import json
import time
import unittest
from urllib.parse import urlencode
import commerce as x

class CommerceTests(unittest.TestCase):
    TOKEN="123456789:TEST_TOKEN_ONLY"
    def signed(self,user_id=12345):
        obj={"auth_date":str(int(time.time())),"user":json.dumps({"id":user_id,"username":"testbuyer"},separators=(",",":")),"query_id":"AA-test"}
        check="\n".join(k+"="+obj[k] for k in sorted(obj))
        secret=hmac.new(b"WebAppData",self.TOKEN.encode(),hashlib.sha256).digest()
        obj["hash"]=hmac.new(secret,check.encode(),hashlib.sha256).hexdigest()
        return urlencode(obj)
    def test_valid_telegram_signature(self):
        self.assertEqual(x.verify_init_data(self.signed(),self.TOKEN)["id"],12345)
    def test_bad_signatures(self):
        self.assertIsNone(x.verify_init_data(self.signed(),"WRONG_TOKEN"))
        self.assertIsNone(x.verify_init_data("user=foo",self.TOKEN))
        self.assertIsNone(x.verify_init_data(self.signed()+"&hash=malicious",self.TOKEN))
    def test_rfq_consent(self):
        payload={"initData":self.signed(),"item":"Полотенца 500 шт.","quantity":"500","budget":"55000","notes":"","consent":True}
        lead=x.rfq_from_body(payload,self.TOKEN)
        self.assertEqual(lead["user"]["username"],"testbuyer")
        self.assertIn("55000",x.rfq_message(lead))
        payload["consent"]=False
        with self.assertRaises(ValueError):x.rfq_from_body(payload,self.TOKEN)
    def test_secrets_rejected(self):
        data={"initData":self.signed(),"item":"пароль admin", "consent":True}
        with self.assertRaises(ValueError):x.rfq_from_body(data,self.TOKEN)
    def test_product_summary(self):
        p={"title":"Набор посуды","url":"https://uvmall.ru/p/1","price":1000,"wholesale_price":900,"min_qty":10,"seller":"Магазин"}
        self.assertIn("Опт: 900 ₽",x.product_summary(p))
        self.assertEqual(len(x.inline_items([p])),1)

if __name__=="__main__":
    unittest.main()
