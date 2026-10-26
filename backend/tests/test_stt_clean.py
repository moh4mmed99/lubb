from app.services.stt import clean


def test_drops_whisper_phantoms_and_loops():
    # what Whisper produced on a long, mostly silent turn (a real case)
    garbled = "السلام عليكم ورحمة الله وبركاته ألو ألو ألو ترجمة نانسي قنقر ترجمة نانسي قنقر تَرجمة نانسي  قنقر."
    # a single repeated word can be real ("ألو ألو" testing a mic), so only multi-word loops are cut
    assert clean(garbled) == "السلام عليكم ورحمة الله وبركاته ألو ألو ألو"
    assert clean("نبدأ الآن نبدأ الآن نبدأ الآن") == "نبدأ الآن"


def test_keeps_real_speech():
    assert clean("نبدأ بالبند الأول، ثم ننتقل إلى الميزانية.") == "نبدأ بالبند الأول، ثم ننتقل إلى الميزانية."
    assert clean("Thanks for watching. Let's review the budget.") == "Let's review the budget."
    assert clean("We need two more weeks, two more people.") == "We need two more weeks, two more people."


def test_nothing_left_is_empty():
    assert clean("Subtitles by the Amara.org community") == ""
    assert clean("  ترجمة نانسي قنقر  ") == ""
