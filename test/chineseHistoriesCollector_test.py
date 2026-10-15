import importlib.util
from pathlib import Path
import unittest
import xml.etree.ElementTree as ET

spec = importlib.util.spec_from_file_location('collector', Path(__file__).parents[1] / 'scripts/collect-chinese-histories-korea.py')
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)


class CollectorTests(unittest.TestCase):
    def test_comparison_preserves_both_texts_without_notes(self):
        html = '<div id="leftContent"><div id="cont_view">高麗<a class="annotation_comment">註 1</a><span class="lyrPopup">주석 1335년</span>來攻</div><span class="dscArea">각주</span></div><div id="rightContent"><div id="cont_view">고려가<br/>쳐들어왔다.</div></div>'
        self.assertEqual(collector.parse_comparison(html), ('高麗來攻', '고려가\n쳐들어왔다.'))

    def test_only_explicit_title_years_are_used(self):
        self.assertEqual(collector.explicit_year('元封 3년(B.C.108) 여름'), -108)
        self.assertEqual(collector.explicit_year('康宗 2년(1104)에'), 1104)
        self.assertIsNone(collector.explicit_year('高麗王은 王楷이다.'))
        self.assertIsNone(collector.explicit_year('권(12345)'))

    def test_ad_and_parallel_korean_reign_dates_in_yuan_titles(self):
        self.assertEqual(collector.explicit_date('[太祖] 14년 (A.D.1219;高麗 高宗 7)정월에 그 나라의'), dict(year=1219, month=1, is_leap_month=False))
        self.assertEqual(collector.explicit_date('[至元 7년(1270)]윤 11월에 세자 愖이 돌아갔다.'), dict(year=1270, month=11, is_leap_month=True))
        self.assertEqual(collector.explicit_date('[至元 7년(1270) 윤 11월] 이 달에 또'), dict(year=1270, month=11, is_leap_month=True))
        self.assertEqual(collector.explicit_date('[太祖] 13년(A.D.1218;高麗 高宗 6)에 황제가'), dict(year=1218, month=None, is_leap_month=False))

    def test_xml_inline_names_are_preserved_and_notes_excluded(self):
        node = ET.fromstring('<paragraph>○ <index type="국명">高麗</index>遣使<annotation><noteContent>주석</noteContent></annotation>來.</paragraph>')
        self.assertEqual(collector.xml_text(node), '○ 高麗遣使來.')


if __name__ == '__main__':
    unittest.main()
