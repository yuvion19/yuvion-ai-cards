#!/usr/bin/env python3
"""Read-only, source-aware SEO coverage of the published Niti Pamyati sitemap."""
import json
import os
import sys
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urldefrag, urljoin, urlsplit
from urllib.request import Request, urlopen
from xml.etree import ElementTree as ET

ORIGIN = "https://niti-pamyati.art"
DOMAIN = "niti-pamyati.art"
SITEMAP = ORIGIN + "/sitemap.xml"
MAX_URLS = 350
MAX_BYTES = 700_000
WORKERS = 5
REPORT_DIR = Path("seo-audit-output")


def request_text(url, timeout=16):
    req = Request(url, headers={"User-Agent": "NitiPamyati-Weekly-SEO/1.0"})
    with urlopen(req, timeout=timeout) as response:
        code = response.status
        final = response.geturl()
        content_type = response.headers.get("Content-Type", "")
        xrobots = response.headers.get("X-Robots-Tag", "")
        data = response.read(MAX_BYTES)
        charset = response.headers.get_content_charset() or "utf-8"
    return code, final, content_type, xrobots, data.decode(charset, "replace")


class PageMeta(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title = ""
        self._in_title = False
        self.description = ""
        self.robots = []
        self.canonicals = []
        self.lang = ""
        self.h1_count = 0
        self.links = []
        self.images = 0
        self.images_missing_alt = 0
    def handle_starttag(self, tag, attrs):
        a = {str(k).lower(): (v or "") for k, v in attrs}
        if tag == "html":
            self.lang = a.get("lang", "")
        elif tag == "title":
            self._in_title = True
        elif tag == "h1":
            self.h1_count += 1
        elif tag == "meta":
            name = a.get("name", "").lower()
            if name == "description":
                self.description = a.get("content", "")
            elif name in ("robots", "googlebot", "bingbot", "yandex"):
                self.robots.append(a.get("content", ""))
        elif tag == "link":
            if "canonical" in a.get("rel", "").lower().split():
                self.canonicals.append(a.get("href", ""))
        elif tag == "a" and a.get("href"):
            self.links.append(a["href"])
        elif tag == "img":
            self.images += 1
            if "alt" not in a:
                self.images_missing_alt += 1
    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False
    def handle_data(self, data):
        if self._in_title:
            self.title += data


def inspect(url):
    row = {"url": url, "critical": [], "warnings": [], "links": []}
    try:
        status, final, typ, xrobots, html = request_text(url)
        row["http_status"] = status
        if status != 200:
            row["critical"].append("unexpected HTTP status: " + str(status))
        if final.rstrip("/") != url.rstrip("/"):
            row["warnings"].append("redirected to " + final)
        if "text/html" not in typ.lower():
            row["warnings"].append("non-HTML content type: " + typ)
        page = PageMeta()
        page.feed(html)
        row.update({
            "title": page.title.strip(),
            "description": page.description.strip(),
            "canonical": page.canonicals[0] if page.canonicals else "",
            "language": page.lang,
            "h1_count": page.h1_count,
            "image_count": page.images,
            "images_missing_alt": page.images_missing_alt,
            "links": page.links,
        })
        if not row["title"]:
            row["warnings"].append("missing title")
        if not row["description"]:
            row["warnings"].append("missing meta description")
        if not page.canonicals:
            row["warnings"].append("missing canonical")
        elif len(page.canonicals) > 1:
            row["warnings"].append("multiple canonical tags")
        elif row["canonical"] != url:
            row["warnings"].append("canonical differs from sitemap URL: " + row["canonical"])
        if not page.lang:
            row["warnings"].append("missing html lang")
        if page.h1_count == 0:
            row["warnings"].append("missing H1")
        if page.h1_count > 1:
            row["warnings"].append("multiple H1")
        if page.images_missing_alt:
            row["warnings"].append(f"{page.images_missing_alt} image(s) without alt attribute")
        if "noindex" in (xrobots + " ".join(page.robots)).lower():
            row["critical"].append("sitemap page declares noindex")
    except HTTPError as exc:
        row["http_status"] = exc.code
        row["critical"].append("HTTP " + str(exc.code))
    except (URLError, TimeoutError, UnicodeError, ValueError) as exc:
        row["critical"].append("request/parse error: " + str(exc)[:200])
    except Exception as exc:
        row["critical"].append("unexpected error: " + str(exc)[:200])
    return row


def main():
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    try:
        code, _, _, _, xml = request_text(SITEMAP, timeout=25)
        if code != 200:
            raise ValueError("Sitemap returned " + str(code))
        root = ET.fromstring(xml)
        if root.tag != "{http://www.sitemaps.org/schemas/sitemap/0.9}urlset":
            raise ValueError("Sitemap root is not urlset")
        urls = [
            (item.findtext("{http://www.sitemaps.org/schemas/sitemap/0.9}loc") or "").strip()
            for item in root.findall("{http://www.sitemaps.org/schemas/sitemap/0.9}url")
        ]
        if not urls or len(urls) > MAX_URLS:
            raise ValueError("Unsafe sitemap size: " + str(len(urls)))
        if any(urlsplit(url).scheme != "https" or urlsplit(url).netloc != DOMAIN for url in urls):
            raise ValueError("Sitemap contains a non-HTTPS or off-domain URL")
    except Exception as exc:
        sys.exit("Sitewide SEO audit stopped before crawling: " + str(exc))

    dupes = len(urls) - len(set(urls))
    urls = list(dict.fromkeys(urls))
    rows = []
    with ThreadPoolExecutor(max_workers=WORKERS) as executor:
        futures = [executor.submit(inspect, url) for url in urls]
        for future in as_completed(futures):
            rows.append(future.result())
    rows.sort(key=lambda r: r["url"])

    seen = set(urls)
    inbound = set()
    for row in rows:
        for href in row["links"]:
            resolved, _ = urldefrag(urljoin(row["url"], href))
            if resolved in seen and resolved != row["url"]:
                inbound.add(resolved)
    orphans = sorted(seen - inbound - {ORIGIN + "/"})
    critical = [row for row in rows if row["critical"]]
    warnings = [row for row in rows if row["warnings"]]
    status_counts = Counter(str(row.get("http_status", "error")) for row in rows)
    examples = [
        f"- {row['url']}: " + "; ".join(row["critical"] + row["warnings"])
        for row in rows if row["critical"] or row["warnings"]
    ][:100]
    summary = [
        "# Niti Pamyati — weekly sitemap-wide SEO coverage",
        "Checked: " + now,
        f"Sitemap entries: {len(urls)} (duplicate entries removed: {dupes})",
        f"HTTP results: {json.dumps(dict(status_counts), ensure_ascii=False)}",
        f"Critical page findings: {len(critical)}",
        f"Pages with SEO warnings: {len(warnings)}",
        f"Pages with no incoming links from other sitemap URLs: {len(orphans)}",
        "",
        "## Findings",
        *(examples if examples else ["- No findings in the checked metadata."]),
        "",
        "## Potentially unlinked URLs (review manually; not proof of a broken link)",
        *(("- " + uri for uri in orphans[:60]) if orphans else ["- None"]),
        "",
        "Technical crawl only. This does not measure ranking, indexation, search impressions or clicks.",
    ]
    REPORT_DIR.mkdir(exist_ok=True)
    (REPORT_DIR / "coverage.md").write_text("\n".join(summary) + "\n", encoding="utf-8")
    (REPORT_DIR / "coverage.json").write_text(
        json.dumps({
            "checked_utc": now, "sitemap_entries": len(urls),
            "duplicate_entries": dupes, "critical_count": len(critical),
            "warning_count": len(warnings), "potentially_unlinked": orphans,
            "pages": [{k: v for k, v in row.items() if k != "links"} for row in rows],
        }, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as output:
            output.write("\n".join(summary[:8]) + "\n\nSee uploaded coverage.md / coverage.json for details.\n")
    print("\n".join(summary[:8]))
    if critical or dupes:
        sys.exit("Technical SEO crawl found critical problems; examine uploaded artifact.")


if __name__ == "__main__":
    main()
