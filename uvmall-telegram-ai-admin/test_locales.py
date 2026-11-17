import unittest
import locales as l
class LocaleTests(unittest.TestCase):
    def test_languages(self):
        self.assertEqual(set(l.LANGS),{"ru","en","tg","uz","zh","fa","hi"})
        for code,meta in l.LANGS.items():
            self.assertTrue(l.instructions(code))
            self.assertTrue(l.ai_language(code))
    def test_buttons_are_valid(self):
        buttons=[button for row in l.markup()["inline_keyboard"] for button in row]
        found={button["callback_data"] for button in buttons}
        for code in l.LANGS:
            self.assertIn("l|"+code,found)
        self.assertIn("h|root",found)
    def test_fallback(self):
        self.assertEqual(l.instructions("unexpected"),l.instructions("ru"))
if __name__=="__main__":unittest.main()
