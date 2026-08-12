import os
import re

def parse_time_interval(value: str, default: int = 300) -> int:
    """
    Парсит строку с интервалом вида '10s', '1m', '1h', '30d' в секунды.
    Если формат неверный или значение пустое, возвращает default.
    """
    if not value:
        return default

    value = value.strip().lower()

    # Регулярка для извлечения числа и единицы измерения
    match = re.match(r'^(\d+)([smhd])$', value)
    
    if not match:
        try:
            # Если передано просто число, считаем, что это секунды
            return int(value)
        except ValueError:
            return default
            
    num, unit = match.groups()
    num = int(num)
    
    if unit == 's':
        return num
    elif unit == 'm':
        return num * 60
    elif unit == 'h':
        return num * 3600
    elif unit == 'd':
        return num * 86400

    return default

def get_env_time_interval(env_name: str, default_value: str = '5m') -> int:
    """
    Получает значение из os.environ и парсит его в секунды.
    """
    raw_value = os.environ.get(env_name, default_value)
    return parse_time_interval(raw_value)

def get_env_int(env_name: str, default_value: int) -> int:
    """
    Получает значение переменной окружения в виде числа.
    Если переменной нет или она не парсится как целое, возвращает default_value.
    Служит абстракцией, чтобы не дублировать try-except в settings.py
    """
    raw_value = os.environ.get(env_name)
    if not raw_value:
        return default_value
    try:
        return int(raw_value)
    except ValueError:
        return default_value
