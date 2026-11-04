"""Check the initial HTML a link-preview crawler receives without running JS."""

from html.parser import HTMLParser
from pathlib import Path
import struct
import unittest
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parents[1]


class PageMetadata(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.structure = []
        self.head_tags = []
        self.metadata = {}
        self.canonical = []
        self.title = ""
        self.in_head = False
        self.in_title = False
        self.feed(html)

    def handle_decl(self, decl):
        self.structure.append(decl.lower())

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in ("html", "head", "body"):
            self.structure.append(tag)
        if tag == "head":
            self.in_head = True
        if self.in_head:
            self.head_tags.append(tag)
            if tag == "meta":
                key = attrs.get("property") or attrs.get("name")
                if key:
                    self.metadata.setdefault(key, []).append(attrs.get("content", ""))
            if tag == "link" and attrs.get("rel") == "canonical":
                self.canonical.append(attrs.get("href"))
        self.in_title = tag == "title"

    def handle_endtag(self, tag):
        if tag in ("html", "head", "body"):
            self.structure.append("/" + tag)
        if tag == "head":
            self.in_head = False
        if tag == "title":
            self.in_title = False

    def handle_data(self, data):
        if self.in_title:
            self.title += data


class LinkPreviewTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = (ROOT / "index.html").read_text()
        cls.page = PageMetadata(cls.html)

    def value(self, key):
        values = self.page.metadata.get(key, [])
        self.assertEqual(len(values), 1, f"Expected one {key}: {values}")
        self.assertTrue(values[0])
        return values[0]

    def test_document_has_one_closed_head_before_the_body(self):
        self.assertEqual(self.page.structure, [
            "doctype html", "html", "head", "/head", "body", "/body", "/html"
        ])
        self.assertTrue(set(self.page.head_tags) <= {
            "head", "meta", "title", "link", "script", "style"
        })
        self.assertEqual(self.page.head_tags.count("title"), 1)
        self.assertEqual(self.page.canonical, ["https://www.koreamanri.com/"])

    def test_sharing_description_and_title_are_explicit_and_consistent(self):
        self.assertEqual(self.value("og:title"), self.page.title)
        self.assertEqual(self.value("twitter:title"), self.page.title)
        description = self.value("description")
        self.assertEqual(self.value("og:description"), description)
        self.assertEqual(self.value("twitter:description"), description)
        self.assertIn("디지털 역사지도", description)
        self.assertNotIn("로딩", description)
        self.assertEqual(self.value("og:type"), "website")
        self.assertEqual(self.value("og:locale"), "ko_KR")
        self.assertEqual(self.value("og:site_name"), "고려만리지도")
        self.assertEqual(self.value("twitter:card"), "summary")

    def test_metadata_is_available_before_any_app_script(self):
        initial_head = PageMetadata(self.html.split("<script", 1)[0])
        for key in ("og:title", "og:description", "og:image", "og:url"):
            self.assertEqual(initial_head.metadata.get(key), [self.value(key)])

    def test_share_urls_are_absolute_unquoted_and_image_is_deployable(self):
        image_url = self.value("og:image")
        self.assertEqual(self.value("og:image:secure_url"), image_url)
        self.assertEqual(self.value("twitter:image"), image_url)
        self.assertEqual(self.value("og:url"), self.page.canonical[0])
        for url in (image_url, self.value("og:url")):
            self.assertNotRegex(url, r'''[\s"'<>]|%22|%27''')
            parsed = urlsplit(url)
            self.assertEqual(parsed.scheme, "https")
            self.assertEqual(parsed.netloc, "www.koreamanri.com")
        # Vercel serves public files at /; Express also serves the root copy.
        image_path = urlsplit(image_url).path.lstrip("/")
        image = (ROOT / "public" / image_path).read_bytes()
        self.assertEqual(image, (ROOT / image_path).read_bytes())
        self.assertEqual(image[:8], b"\x89PNG\r\n\x1a\n")
        width, height = struct.unpack(">II", image[16:24])
        self.assertEqual((width, height), (
            int(self.value("og:image:width")), int(self.value("og:image:height"))
        ))
        self.assertGreaterEqual(min(width, height), 150)
        self.assertLessEqual(max(width, height) / min(width, height), 3)
        self.assertGreater(len(image), 5000)
        self.assertEqual(self.value("og:image:type"), "image/png")
        self.assertEqual(self.value("og:image:alt"), self.value("twitter:image:alt"))


if __name__ == "__main__":
    unittest.main()
