#!/usr/bin/env python3
"""Collect NIKH's Korea excerpts, preserving official text and explicit dates.

python3 scripts/collect-chinese-histories-korea.py --output outputs/chinese-histories-korea
No database writes. Cached responses allow interrupted collections to resume.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import time
import threading
import urllib.request
import unicodedata
import xml.etree.ElementTree as ET

BASE = 'https://db.history.go.kr'


class Node:
    def __init__(self, tag='', attrs=()):
        self.tag, self.attrs, self.children = tag, dict(attrs), []

    def walk(self):
        yield self
        for child in self.children:
            if isinstance(child, Node):
                yield from child.walk()

    def text(self):
        classes = self.attrs.get('class', '').split()
        if self.tag in ('script', 'style') or any(c in classes for c in ('lyrPopup', 'annotation_comment', 'dscArea')):
            return ''
        value = ''.join(c.text() if isinstance(c, Node) else c for c in self.children)
        return value + ('\n' if self.tag in ('div', 'p', 'br') else '')


class TreeParser(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.root = Node()
        self.stack = [self.root]
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs)
        self.stack[-1].children.append(node)
        if tag not in ('area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'):
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                break

    def handle_data(self, data):
        self.stack[-1].children.append(data)


def normalize(value):
    return '\n'.join(re.sub(r'\s+', ' ', line).strip() for line in value.splitlines() if line.strip())


def explicit_date(title):
    # Only the article title can anchor its year. Dates in notes or later
    # narrative must never be mistaken for the date of the whole article.
    match = re.search(r'\(\s*(?:(B\.?\s*C\.?|A\.?\s*D\.?|기원전|서기)\s*)?(\d{1,4})\s*(?:년)?(?=\s*[);；])', title, re.I)
    if not match:
        return dict(year=None, month=None, is_leap_month=False)
    year = int(match[2])
    if year == 0 or year > 1912:
        return dict(year=None, month=None, is_leap_month=False)
    era = re.sub(r'[.\s]', '', match[1] or '').upper()
    year = -year if era in ('BC', '기원전') else year
    # The official title may include the Korean reign after a semicolon.
    # Read only the month immediately after that dating clause, never a
    # later month mentioned in the article's narrative.
    clause_end = title.find(')', match.end())
    month_match = re.match(r'\s*\]?\s*(?:(윤)\s*)?(정|\d{1,2})월', title[clause_end + 1:]) if clause_end >= 0 else None
    month = (1 if month_match[2] == '정' else int(month_match[2])) if month_match else None
    if month is not None and not 1 <= month <= 12:
        month = None
    return dict(year=year, month=month, is_leap_month=bool(month_match and month_match[1]))


def explicit_year(title):
    return explicit_date(title)['year']


def parse_comparison(html):
    tree = TreeParser(html).root
    texts = {}
    for node in tree.walk():
        if node.attrs.get('id') in ('leftContent', 'rightContent'):
            body = next((n for n in node.walk() if n.attrs.get('id') == 'cont_view'), None)
            texts[node.attrs['id']] = normalize(body.text()) if body else ''
    return texts.get('leftContent', ''), texts.get('rightContent', '')


BOOKS = dict(zip(
    '史記 漢書 後漢書 三國志 晉書 宋書 南齊書 梁書 陳書 魏書 北齊書 周書 南史 北史 隋書 舊唐書 新唐書 舊五代史 新五代史'.split(),
    '사기 한서 후한서 삼국지 진서 송서 남제서 양서 진서 위서 북제서 주서 남사 북사 수서 구당서 신당서 구오대사 신오대사'.split()
))


def xml_text(node):
    if node is None or node.tag in ('annotation', 'noteContent'):
        return ''
    value = node.text or ''
    for child in node:
        value += xml_text(child) + (child.tail or '')
    return value


def collect_local_xml(directory):
    rows = []
    for file in sorted(directory.glob('ko_*.xml')):
        root = ET.parse(file).getroot()
        book = root if root.tag == 'level1' else root.find('level1')
        name = (book.findtext('front/biblioData/title/mainTitle') or '').strip()
        if name not in BOOKS:
            continue
        source = f'{BOOKS[name]}({name})' if name != '陳書' else '진서(陳書/陳)'
        for chapter in book.findall('level2'):
            section = xml_text(chapter.find('front/biblioData/title/mainTitle')).strip()
            for article in chapter.findall('level3'):
                title = xml_text(article.find('front/biblioData/title/mainTitle')).strip()
                paragraphs = article.findall('text/content/paragraph')
                original = normalize('\n'.join(xml_text(p) for p in paragraphs))
                if not title or not original:
                    continue
                date = article.find('front/biblioData/date/dateOccured')
                date_string = date.attrib.get('date', '') if date is not None else ''
                match = re.match(r'^(-?\d{1,4})-(\d{2})-(\d{2})', date_string)
                year = int(match[1]) if match and 0 < abs(int(match[1])) <= 1912 else None
                month = int(match[2]) if year is not None and 1 <= int(match[2]) <= 12 else None
                record_id = article.attrib['id']
                rows.append(dict(source_id=record_id, title=title, source=source,
                                 sectionTitle=section, source_url=BASE + '/id/' + record_id,
                                 year=year, month=month, content=original, original_content=original,
                                 content_type='chinese_original', collection='한국고대사료집성 중국편',
                                 date_basis='official_xml_date' if year is not None else 'undated',
                                 official_date=date_string or None, tags=['중국 25사', '한국 관련 기사']))
    return rows


def download(url, target):
    if target.exists() and target.stat().st_size:
        return target.read_text(encoding='utf-8-sig')
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=35) as response:
                value = response.read().decode('utf-8-sig')
            if 'Request Blocked' in value or not value.strip():
                raise ValueError('Empty or blocked public response')
            target.write_text(value, encoding='utf-8')
            return value
        except Exception:
            if attempt == 2:
                raise
            time.sleep(1 + attempt)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--local-xml', type=Path)
    parser.add_argument('--workers', type=int, default=1)
    parser.add_argument('--cached-only', action='store_true')
    parser.add_argument('--book', help='Collect one official book, e.g. jo_021 for 元史')
    args = parser.parse_args()
    out = args.output
    out.mkdir(parents=True, exist_ok=True)
    if args.local_xml:
        directory = next((p for p in args.local_xml.iterdir() if '한국고대사료집성' in unicodedata.normalize('NFC', p.name)), None)
        if not directory:
            raise ValueError('Official 한국고대사료집성 XML folder not found')
        rows = collect_local_xml(directory)
        with (out / 'records.jsonl').open('w') as file:
            for row in rows:
                file.write(json.dumps(row, ensure_ascii=False) + '\n')
        print(json.dumps(dict(articles=len(rows), dated=sum(r['year'] is not None for r in rows), undated=sum(r['year'] is None for r in rows)), ensure_ascii=False))
        return
    cache = out / 'cache'
    cache.mkdir(parents=True, exist_ok=True)
    books = download(BASE + '/ancient/level.do?itemId=jo&types=o', out / 'books.html')
    book_ids = sorted(set(re.findall(r'levelId=(jo_\d{3})_', books)))
    if len(book_ids) != 24:
        raise ValueError(f'Unexpected official book count: {len(book_ids)}')
    if args.book:
        if args.book not in book_ids:
            raise ValueError(f'Unknown official book: {args.book}')
        book_ids = [args.book]
    entries = {}
    for book in book_ids:
        csv = download(BASE + f'/downloadItemLevel.do?itemId=jo&parentId={book}r&types=r', cache / f'{book}.csv')
        for line in csv.splitlines()[1:]:
            parts = line.split('^')
            if len(parts) != 6:
                raise ValueError(f'Invalid official metadata: {line[:120]}')
            record_id, title, country, source, section, url = parts
            entries[record_id] = dict(source_id=record_id, title=title.strip(), country=country, source=re.sub(r'\(\d+\)$', '', source), sectionTitle=section, source_url=url)
        print(f'{book}: metadata collected', flush=True)
    # Non-leaf headings and bibliography are not historical articles.
    ids = set(entries)
    parents = {record_id.rsplit('_', 1)[0] for record_id in ids}
    leaves = [row for key, row in entries.items() if key not in parents and not re.search(r'참고문헌|參考文獻|해제|解題', row['title'])]
    (out / 'manifest.json').write_text(json.dumps(leaves, ensure_ascii=False, indent=2))
    pending_ids = []
    if args.cached_only:
        pending_ids = [row['source_id'] for row in leaves if not (cache / f'{row["source_id"]}.html').exists()]
        leaves = [row for row in leaves if (cache / f'{row["source_id"]}.html').exists()]
    print(f'Collecting {len(leaves)} official Korea excerpts', flush=True)

    unavailable = threading.Event()

    def collect(row):
        if unavailable.is_set():
            raise RuntimeError('Collection stopped after public server connection failure; rerun to resume')
        original_id = row['source_id'].replace('r_', '_')
        target = cache / f'{row["source_id"]}.html'
        if not target.exists():
            time.sleep(2)
        try:
            html = download(BASE + f'/common/compareViewer.do?levelId={row["source_id"]}&type=ancient', target)
        except Exception:
            unavailable.set()
            raise
        original, translation = parse_comparison(html)
        if not original or not translation:
            raise ValueError(f'Missing original or translation: {row["source_id"]}')
        return dict(row, **explicit_date(row['title']),
                    content=translation + '\n\n[한문 원문]\n' + original,
                    original_content=original, translation=translation,
                    content_type='translation', translation_status='published_translation',
                    translation_provider='국사편찬위원회', collection='중국정사조선전',
                    original_source_id=original_id,
                    date_basis='explicit_year_in_title' if explicit_year(row['title']) is not None else 'undated',
                    tags=['중국 25사', '한국 관련 기사'])

    rows, failures = [], []
    with ThreadPoolExecutor(max_workers=max(1, min(args.workers, 4))) as pool:
        futures = {pool.submit(collect, row): row for row in leaves}
        for number, future in enumerate(as_completed(futures), 1):
            try:
                rows.append(future.result())
            except Exception as error:
                failures.append(dict(source_id=futures[future]['source_id'], error=str(error)))
            if number % 50 == 0 or number == len(leaves):
                print(f'{number}/{len(leaves)} collected; failures={len(failures)}', flush=True)
    rows.sort(key=lambda row: row['source_id'])
    with (out / 'records.jsonl').open('w') as file:
        for row in rows:
            file.write(json.dumps(row, ensure_ascii=False) + '\n')
    summary = dict(books=len(book_ids), articles=len(rows), dated=sum(row['year'] is not None for row in rows), undated=sum(row['year'] is None for row in rows), pending_ids=pending_ids, failures=failures)
    (out / 'collection-summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2))
    print(json.dumps({k: v for k, v in summary.items() if k != 'pending_ids'} | {'pending': len(pending_ids)}, ensure_ascii=False), flush=True)
    if failures:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
