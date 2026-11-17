"""Spreadsheet preparation for UVMALL sellers.

Audits XLSX and CSV locally in RAM, without calling AI or editing uploaded files.
This is not a replacement for the UVMALL seller-panel import API.
"""
import csv
import io
import re
import zipfile
from xml.etree import ElementTree as ET

MAX_FILE=8_500_000
MAX_ROWS=2500
MAX_XML=18_000_000
HEADERS=[
  "Артикул","Название","Категория","Описание","Бренд","Цена розничная",
  "Цена средний опт","Цена крупный опт","Мин. количество среднего опта",
  "Мин. количество крупного опта","Остаток","Ссылка на фото",
  "Ссылка на товар","Павильон"
]
ALIASES={
 "title":["название","наименование","товар","title","name","product_name"],
 "category":["категория","category","category_name"],
 "price":["цена розничная","цена","price","retail_price"],
 "photo":["ссылка на фото","фото","image","image_url","photo","photo_url"],
 "sku":["артикул","sku","id","product_id"],
}
NS="{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"

def template_bytes():
    output=io.StringIO(newline="")
    writer=csv.writer(output,delimiter=";")
    writer.writerow(HEADERS)
    return b"\xef\xbb\xbf"+output.getvalue().encode("utf-8")

def norm(s):
    return re.sub(r"\s+"," ",str(s or "").strip().lower().replace("ё","е"))

def _headers(headers):
    values=[norm(x) for x in headers]
    return {k:next((i for i,n in enumerate(values) if n in names),None)
            for k,names in ALIASES.items()}

def _audit(rows):
    if not rows:return {"ok":False,"error":"Файл не содержит заголовков."}
    header=[str(x or "") for x in rows[0]]
    fields=_headers(header)
    if fields["title"] is None:
        return {"ok":False,"error":"Не найдена колонка «Название»."}
    seen=set()
    duplicates=0
    missing_title=0
    missing_price=0
    missing_category=0
    missing_photo=0
    bad_price=0
    product_count=0
    for row in rows[1:MAX_ROWS+1]:
        if not any(str(v or "").strip() for v in row):continue
        product_count+=1
        def get(name):
            i=fields[name]
            return str(row[i] or "").strip() if i is not None and i<len(row) else ""
        if not get("title"): missing_title+=1
        if not get("category"):missing_category+=1
        price=get("price")
        if not price:missing_price+=1
        else:
            raw=price.replace(" ","").replace("\u00a0","").replace("₽","").replace(",",".")
            try:
                value=float(raw)
                if not 0<=value<=1e10:bad_price+=1
            except ValueError:bad_price+=1
        if not get("photo"):missing_photo+=1
        sku=get("sku")
        if sku:
            if sku in seen:duplicates+=1
            seen.add(sku)
    return {"ok":True,"rows_checked":product_count,
            "truncated":len(rows)>MAX_ROWS+1,
            "missing_columns":[k for k,v in fields.items() if v is None],
            "missing_title":missing_title,"missing_price":missing_price,
            "missing_category":missing_category,"missing_photo":missing_photo,
            "bad_price":bad_price,"duplicate_sku":duplicates}

def csv_rows(data):
    if len(data)>MAX_FILE:raise ValueError("Файл слишком большой.")
    try:text=data.decode("utf-8-sig")
    except UnicodeDecodeError:text=data.decode("cp1251")
    try:
        dialect=csv.Sniffer().sniff(text[:8192],delimiters=";,\t")
        delimiter=dialect.delimiter
    except csv.Error:delimiter=";"
    return list(csv.reader(io.StringIO(text),delimiter=delimiter))[:MAX_ROWS+2]

def xlsx_rows(data):
    if len(data)>MAX_FILE:raise ValueError("Файл слишком большой.")
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        files=z.infolist()
        if len(files)>300:raise ValueError("Слишком много внутренних файлов XLSX.")
        total=sum(x.file_size for x in files)
        if total>MAX_XML*3:raise ValueError("XLSX слишком большой после распаковки.")
        sheets=sorted(f.filename for f in files if re.fullmatch(r"xl/worksheets/sheet\d+\.xml",f.filename))
        if not sheets:raise ValueError("Не найдена таблица XLSX.")
        strings=[]
        if "xl/sharedStrings.xml" in z.namelist():
            if z.getinfo("xl/sharedStrings.xml").file_size>MAX_XML:
                raise ValueError("Слишком большие текстовые данные XLSX.")
            tree=ET.fromstring(z.read("xl/sharedStrings.xml"))
            for si in tree.findall(NS+"si"):
                strings.append("".join((t.text or "") for t in si.iter(NS+"t")))
                if len(strings)>200000:raise ValueError("Слишком много текстовых ячеек.")
        first=sheets[0]
        if z.getinfo(first).file_size>MAX_XML:
            raise ValueError("Лист XLSX слишком большой.")
        sheet=ET.fromstring(z.read(first))
        out=[]
        for row in sheet.iter(NS+"row"):
            values=[]
            for cell in row.findall(NS+"c"):
                ref=cell.get("r","")
                match=re.match(r"([A-Za-z]+)",ref)
                if not match:continue
                col=0
                for ch in match.group(1).upper():
                    col=col*26+ord(ch)-64
                idx=col-1
                if idx<0 or idx>=80:continue
                while len(values)<=idx:values.append("")
                t=cell.get("t")
                v=cell.find(NS+"v")
                inline=cell.find(NS+"is")
                if t=="s" and v is not None and (v.text or "").isdigit():
                    p=int(v.text or 0)
                    values[idx]=strings[p] if p<len(strings) else ""
                elif t=="inlineStr" and inline is not None:
                    values[idx]="".join((n.text or "") for n in inline.iter(NS+"t"))
                elif v is not None:
                    values[idx]=v.text or ""
            out.append(values)
            if len(out)>MAX_ROWS+1:break
        return out

def audit(data,filename):
    lower=str(filename or "").lower()
    if lower.endswith(".csv"): rows=csv_rows(data)
    elif lower.endswith(".xlsx"): rows=xlsx_rows(data)
    else: raise ValueError("Поддерживаются только .xlsx и .csv.")
    return _audit(rows)

def report(result):
    if not result["ok"]:return "Не удалось проверить файл: "+result["error"]
    fields={"missing_title":"Без названия","missing_price":"Без розничной цены",
            "missing_category":"Без категории","missing_photo":"Без ссылки на фото",
            "bad_price":"Цена с ошибочным форматом","duplicate_sku":"Повторяющиеся артикулы"}
    lines=["UVMALL AI — проверка таблицы","Строк товаров проверено: "+str(result["rows_checked"])]
    for field,label in fields.items():
        if result[field]:lines.append("• "+label+": "+str(result[field]))
    if result["truncated"]:lines.append("Проверены первые "+str(MAX_ROWS)+" товаров.")
    if result["missing_columns"]:
        lines.append("Недостающие колонки: "+", ".join(result["missing_columns"]))
    lines.append("Это предварительная проверка. Файл не изменялся и товары не отправлялись на модерацию.")
    return "\n".join(lines)
