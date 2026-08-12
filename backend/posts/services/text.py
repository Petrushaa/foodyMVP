"""
Проверка ввода на осмысленность.

Пользователь сам вводит название и адрес заведения, поэтому кто-то обязательно
попробует написать «asdfgh» или «12345». Здесь набор дешёвых эвристик, которые
такое ловят.

**Это не запрет, а счётчик подозрительности.** Жёстко отклоняем только совсем
очевидное — строку без единой буквы. Остальное поднимает пост в очереди модерации
с пометкой, потому что иначе поймаем ложные срабатывания на живых названиях вроде
«Кафе XYZ» или «БЛЮZ», а такие существуют.
"""

import re

VOWELS = set('аеиоуыэюяёaeiouy')

# Ряды клавиатуры: если в строке подряд идут соседние клавиши, это набор вслепую.
_KEYBOARD_ROWS = [
    'йцукенгшщзхъ', 'фывапролджэ', 'ячсмитьбю',
    'qwertyuiop', 'asdfghjkl', 'zxcvbnm',
    '1234567890',
]

_LETTERS_RE = re.compile(r'[^\W\d_]', re.UNICODE)


def _letters_ratio(text):
    if not text:
        return 0.0
    return sum(1 for ch in text if _LETTERS_RE.match(ch)) / len(text)


def _has_keyboard_run(text, run=4):
    """Есть ли в строке цепочка соседних клавиш длиной `run` и больше."""
    lowered = text.lower()
    for row in _KEYBOARD_ROWS:
        for start in range(len(row) - run + 1):
            chunk = row[start:start + run]
            if chunk in lowered or chunk[::-1] in lowered:
                return True
    return False


def _has_long_repeat(text, run=4):
    """«ааааа» и «!!!!!» — подряд один и тот же символ."""
    return re.search(r'(.)\1{%d,}' % (run - 1), text.lower()) is not None


def _has_vowelless_word(text, min_length=5):
    """Длинное слово без единой гласной — почти наверняка набор вслепую."""
    for word in re.split(r'\W+', text.lower()):
        if len(word) >= min_length and not (set(word) & VOWELS):
            return True
    return False


def _low_variety(text, min_length=6):
    """Мало разных символов на длину строки: «абабабаб»."""
    letters = [ch for ch in text.lower() if _LETTERS_RE.match(ch)]
    if len(letters) < min_length:
        return False
    return len(set(letters)) / len(letters) < 0.35


def check_name(value):
    """
    Проверяет название заведения или позиции.

    Возвращает список причин, по которым ввод выглядит мусором. Пустой список —
    претензий нет.
    """
    text = (value or '').strip()
    reasons = []

    if len(text) < 2:
        reasons.append('слишком короткое название')
        return reasons

    if _letters_ratio(text) < 0.3:
        reasons.append('в названии почти нет букв')
    if _has_keyboard_run(text):
        reasons.append('похоже на случайный набор с клавиатуры')
    if _has_long_repeat(text):
        reasons.append('подряд повторяется один символ')
    if _has_vowelless_word(text):
        reasons.append('в слове нет ни одной гласной')
    if _low_variety(text):
        reasons.append('слишком мало разных букв')

    return reasons


def check_address(value):
    """
    Проверяет адрес. Требования мягкие: хотя бы одна цифра (номер дома)
    и минимум два слова — иначе это не адрес, а отписка.
    """
    text = (value or '').strip()
    reasons = []

    if len(text) < 5:
        reasons.append('слишком короткий адрес')
        return reasons

    if not any(ch.isdigit() for ch in text):
        reasons.append('в адресе нет номера дома')
    if len(text.split()) < 2:
        reasons.append('адрес из одного слова')
    if _letters_ratio(text) < 0.3:
        reasons.append('в адресе почти нет букв')
    if _has_keyboard_run(text):
        reasons.append('адрес похож на случайный набор')

    return reasons


def is_definitely_garbage(value):
    """
    Совсем очевидный мусор — такое отклоняем сразу, не отдавая модератору:
    в строке нет ни одной буквы.
    """
    text = (value or '').strip()
    return not text or not _LETTERS_RE.search(text)
