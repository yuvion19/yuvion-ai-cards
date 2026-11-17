"""Seller spreadsheet checks, using synthetic local data only."""
import csv
import io
import unittest
import zipfile
import seller_tools as s

class SellerTests(unittest.TestCase):
    def test_blank_csv_template(self):
        header=s.template_bytes().decode("utf-8-sig").splitlines()[0]
        self.assertIn("Название",header)
        self.assertIn("Цена розничная",header)
    def test_csv_valid(self):
        rows=[s.HEADERS,["p-1","Комплект белья","Текстиль","","","1300",
                          "","","","","10","https://site.ru/p.jpg","","8"]]
        stream=io.StringIO(newline="")
        writer=csv.writer(stream,delimiter=";")
        writer.writerows(rows)
        result=s.audit(stream.getvalue().encode("utf-8"),"template.csv")
        self.assertTrue(result["ok"])
        self.assertEqual(result["rows_checked"],1)
        self.assertEqual(result["missing_price"],0)
        self.assertEqual(result["missing_photo"],0)
    def test_bad_csv(self):
        b="Название;Цена розничная\nЧайник;не цена\nЧайник 2;1500\n".encode()
        x=s.audit(b,"goods.csv")
        self.assertEqual(x["bad_price"],1)
        self.assertEqual(x["missing_category"],2)
    def test_xlsx_inline(self):
        data=io.BytesIO()
        xml="""<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Название</t></is></c>
<c r="B1" t="inlineStr"><is><t>Цена</t></is></c></row>
<row r="2"><c r="A2" t="inlineStr"><is><t>Чайник</t></is></c>
<c r="B2"><v>1200</v></c></row></sheetData></worksheet>"""
        with zipfile.ZipFile(data,"w") as z:z.writestr("xl/worksheets/sheet1.xml",xml)
        x=s.audit(data.getvalue(),"sample.xlsx")
        self.assertTrue(x["ok"])
        self.assertEqual(x["rows_checked"],1)
        self.assertEqual(x["missing_price"],0)
    def test_no_unexpected_filetype(self):
        with self.assertRaises(ValueError):
            s.audit(b"content","a.exe")
    def test_empty_xlsx(self):
        with self.assertRaises((ValueError,zipfile.BadZipFile)):
            s.audit(b"not a zip","bad.xlsx")

if __name__=="__main__":unittest.main()
