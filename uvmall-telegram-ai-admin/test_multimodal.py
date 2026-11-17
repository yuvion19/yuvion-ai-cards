"""Safe media parsing and provider-independent checks."""
import unittest
import multimodal as m

class MediaTests(unittest.TestCase):
    def test_reject_missing_id(self):
        with self.assertRaises(ValueError):
            m.download_telegram_media("TEST",{})
    def test_reject_bad_media_type_without_network(self):
        with self.assertRaises(ValueError):
            m.describe_media("TOKEN",{},"unknown",lambda:"TOKEN",lambda:None)
    def test_upload_reject_bad_mime(self):
        with self.assertRaises(ValueError):
            m.upload_gigachat(b"body","application/octet-stream","x","fake",None)
    def test_reject_large_file(self):
        with self.assertRaises(ValueError):
            m.upload_gigachat(b"x"*(m.MAX_MEDIA+1),"image/jpeg","x.jpg","fake",None)

if __name__=="__main__":
    unittest.main()
