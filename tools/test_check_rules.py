"""Tests for tools/check_rules.py. Run: python3 -m unittest discover -s tools -p 'test_*.py'

The private vocabulary is never written here: the tests swap in a made-up word.
"""
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_rules as cr  # noqa: E402


def temp_file(suffix, text):
    """A file inside the repository (the checks report paths relative to it)."""
    handle = tempfile.NamedTemporaryFile('w', suffix=suffix, dir=cr.ROOT, delete=False,
                                         encoding='utf-8')
    handle.write(text)
    handle.close()
    return Path(handle.name)


class DomainWords(unittest.TestCase):
    def test_flags_a_listed_word_in_any_case(self):
        path = temp_file('.md', 'fine line\nthe Zorbulate matters\n')
        try:
            with mock.patch.object(cr, 'DOMAIN_HASHES', {cr.domain_hash('zorbulate')}):
                problems = cr.check_domain_words([path])
        finally:
            path.unlink()
        self.assertEqual(len(problems), 1)
        self.assertIn(':2:', problems[0])

    def test_the_repository_is_clean(self):
        self.assertEqual(cr.check_domain_words(cr.tracked_files()), [])


class EnglishInCode(unittest.TestCase):
    def test_flags_accented_letters_in_code_only(self):
        text = '// can\u00e7\u00f3\n'
        code, doc = temp_file('.js', text), temp_file('.md', text)
        try:
            self.assertEqual(len(cr.check_english_in_code([code])), 1)
            self.assertEqual(cr.check_english_in_code([doc]), [])
        finally:
            code.unlink()
            doc.unlink()

    def test_marked_test_data_passes(self):
        path = temp_file('.py', 'x = "\u00f1"  # ' + cr.ALLOW_NON_ENGLISH + '\n')
        try:
            self.assertEqual(cr.check_english_in_code([path]), [])
        finally:
            path.unlink()

    def test_symbols_are_not_letters(self):
        path = temp_file('.py', '# \u00a7 4, \u00b1 24, 70\u00d740, \u2014 \u2026\n')
        try:
            self.assertEqual(cr.check_english_in_code([path]), [])
        finally:
            path.unlink()


class SetNames(unittest.TestCase):
    def test_pattern(self):
        self.assertTrue(cr.SET_NAMES.search('if (name == "TGHC Song")'))
        self.assertFalse(cr.SET_NAMES.search('Alberton Drum Mapper'))

    def test_repository_passes(self):
        self.assertEqual(cr.check_repo_rules(cr.tracked_files()), [])


if __name__ == '__main__':
    unittest.main()
