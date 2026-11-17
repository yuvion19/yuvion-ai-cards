"""UVMALL AI response-language preferences. Russian support FAQ stays authoritative."""
LANGS={
 "ru":{"name":"Русский","ai_name":"русском","message":"Язык ответов UVMALL AI: русский.\nПишите вопрос своими словами или используйте /help, /search, /wholesale, /site."},
 "en":{"name":"English","ai_name":"English","message":"UVMALL AI now answers in English. Ask a question, or use /search, /wholesale, /help and /site. Some FAQ pages are currently in Russian."},
 "tg":{"name":"Тоҷикӣ","ai_name":"тоҷикӣ (Tajik Cyrillic)","message":"Забони ҷавобҳои UVMALL AI: тоҷикӣ.\nСаволатонро нависед. Фармонҳо: /search, /wholesale, /help, /site. Қисми дастурҳо ба русӣ ҳастанд."},
 "uz":{"name":"Oʻzbekcha","ai_name":"o‘zbek tilida (Uzbek Latin)","message":"UVMALL AI javoblari tili: o‘zbekcha.\nSavolingizni yozing yoki /search, /wholesale, /help, /site dan foydalaning. Ba'zi qo‘llanmalar rus tilida."},
 "zh":{"name":"中文","ai_name":"简体中文 (Simplified Chinese)","message":"UVMALL AI 将使用简体中文回答问题。可直接提问，或使用 /search、/wholesale、/help、/site。部分帮助说明仍为俄语。"},
 "fa":{"name":"دری / فارسی","ai_name":"دری (Afghan Dari Persian)","message":"زبان پاسخ‌های UVMALL AI دری است. سؤال خود را بنویسید یا از /search، /wholesale، /help، /site استفاده کنید. برخی راهنماها به روسی هستند."},
 "hi":{"name":"हिन्दी","ai_name":"हिन्दी (Hindi)","message":"UVMALL AI अब हिन्दी में जवाब देगा। सवाल लिखें या /search, /wholesale, /help, /site इस्तेमाल करें। कुछ सहायता सामग्री रूसी में है।"}
}
PICK_TEXT="Выберите язык ответов UVMALL AI. Инструкции по некоторым разделам пока остаются на русском."
def markup():
    return {"inline_keyboard":[
        [{"text":"Русский","callback_data":"l|ru"},{"text":"English","callback_data":"l|en"}],
        [{"text":"Тоҷикӣ","callback_data":"l|tg"},{"text":"Oʻzbekcha","callback_data":"l|uz"}],
        [{"text":"中文","callback_data":"l|zh"},{"text":"دری / فارسی","callback_data":"l|fa"}],
        [{"text":"हिन्दी","callback_data":"l|hi"}],
        [{"text":"Назад к помощи","callback_data":"h|root"}],
    ]}
def instructions(code):
    return LANGS.get(code,LANGS["ru"])["message"]
def ai_language(code):
    return LANGS.get(code,LANGS["ru"])["ai_name"]
