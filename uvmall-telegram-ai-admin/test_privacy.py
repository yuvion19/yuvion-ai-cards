import unittest
import privacy as p

class PrivacyTests(unittest.TestCase):
    def test_luhn(self):
        self.assertTrue(p.luhn("4111111111111111"))
        self.assertFalse(p.luhn("4111111111111112"))
        self.assertFalse(p.luhn("1234"))
    def test_card_not_forwarded_to_ai(self):
        self.assertIsNone(p.prepare_for_ai("Покупатель: 4111 1111 1111 1111"))
    def test_telegram_token_not_forwarded(self):
        self.assertIsNone(p.prepare_for_ai("987654321:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefg"))
    def test_api_keys_not_forwarded(self):
        self.assertIsNone(p.prepare_for_ai("sk-proj-"+"x"*40))
    def test_email_and_phone_masked(self):
        value=p.prepare_for_ai("Пишите test@example.com телефон +7 (999) 123-45-67")
        self.assertNotIn("test@example.com",value)
        self.assertNotIn("123-45-67",value)
        self.assertIn("[email скрыт]",value)
    def test_normal_search_survives(self):
        self.assertEqual(p.prepare_for_ai("Нужен чайник 3 литра, 10 штук"),"Нужен чайник 3 литра, 10 штук")
    def test_pasport_block(self):
        self.assertIsNone(p.prepare_for_ai("Вот мой паспорт 1234567890"))

if __name__=="__main__": unittest.main()
