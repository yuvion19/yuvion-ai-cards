"""Lightweight checks for help menu, FAQ routing and customer safety wording."""
import unittest
import helpdesk as h

class HelpdeskTests(unittest.TestCase):
    def test_sections_have_topics(self):
        self.assertEqual(set(h.SECTIONS), {"seller", "buyer", "tech"})
        self.assertGreaterEqual(sum(len(s["topics"]) for s in h.SECTIONS.values()), 15)

    def test_root_buttons(self):
        rows = h.root_markup()["inline_keyboard"]
        data = [b["callback_data"] for row in rows for b in row]
        for route in ("h|seller", "h|buyer", "h|tech", "h|ask", "h|manager"):
            self.assertIn(route, data)
        self.assertTrue(all(len(route.encode("utf-8")) <= 64 for route in data))

    def test_all_pages_are_readable(self):
        for section, meta in h.SECTIONS.items():
            self.assertIn(meta["title"], h.section_text(section))
            for topic, (title, answer) in meta["topics"].items():
                self.assertIn(title, h.page_text(section, topic))
                self.assertIn(answer, h.page_text(section, topic))
                self.assertLessEqual(len(("h|" + section + "|" + topic).encode()), 64)
                self.assertTrue(answer.strip())

    def test_application_button_opens_uvmall(self):
        items = [button for row in h.root_markup()["inline_keyboard"] for button in row]
        site = [button for button in items if button.get("text") == "Открыть сайт UVMALL"]
        self.assertEqual(len(site), 1)
        self.assertEqual(site[0]["url"], "https://uvmall.ru/")

    def test_numbered_menu(self):
        for name, meta in h.SECTIONS.items():
            keys = list(meta["topics"])
            for index, key in enumerate(keys, 1):
                self.assertEqual(h.topic_by_number(name, str(index)), key)
            self.assertIsNone(h.topic_by_number(name, "0"))
            self.assertIsNone(h.topic_by_number(name, "100"))
            self.assertIsNone(h.topic_by_number(name, "abc"))

    def test_uvmall_ai_brand_visible(self):
        buttons = [item["text"] for row in h.root_markup()["inline_keyboard"] for item in row]
        self.assertTrue(any("UVMALL AI" in x for x in buttons))
        for section, data in h.SECTIONS.items():
            for topic in data["topics"]:
                self.assertNotIn("GigaChat", h.page_text(section, topic))
        self.assertIn("UVMALL AI", h.page_text("seller", "products"))

    def test_topic_matching(self):
        cases = {
            "Почему товар отклонён на модерации?": ("seller", "moderation"),
            "Как загрузить Excel?": ("seller", "excel"),
            "Не загружаются фотографии": ("tech", "photos"),
            "Где мой заказ?": ("buyer", "orders"),
            "Как оформить возврат?": ("buyer", "return"),
        }
        for prompt, expected in cases.items():
            self.assertEqual(h.topic_by_words(prompt), expected)

    def test_no_false_live_data_claim(self):
        for section in h.SECTIONS.values():
            for title, answer in section["topics"].values():
                self.assertNotIn("Гарантируем", title + answer)
                self.assertNotIn("бесплатное размещение", (title + answer).lower())

if __name__ == "__main__":
    unittest.main()
