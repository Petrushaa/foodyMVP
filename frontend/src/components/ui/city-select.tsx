"use client";

import * as React from "react";

import { GlassSurface } from "@/components/feed/glass-surface";

// Фиксированный список городов.
//
// Список закрытый не для красоты — по городу делится лента. Свободный ввод
// развёл бы «Ростов», «Ростов-на-Дону» и «ростов на дону» по разным лентам,
// и люди из одного города не видели бы друг друга.
//
// Города добавляются по мере запуска сервиса в них: регистрация требует
// выбрать из списка, поэтому попасть в сервис можно только отсюда.
//
// Бэкенд хранит city свободной строкой, поэтому ограничение живёт здесь.
export const CITIES = [
  "Москва",
  "Санкт-Петербург",
  "Екатеринбург",
  "Ростов-на-Дону",
  "Воронеж",
  "Краснодар",
  "Сочи",
  "Казань",
] as const;

/**
 * Приводит написание к виду, по которому ищем: нижний регистр, «ё» → «е»,
 * дефисы и точки — в пробелы. Так «ростов на дону» находит «Ростов-на-Дону»,
 * а «орел» — «Орёл». Повторяет normalize_name на бэкенде.
 */
function normalize(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\wа-я\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type CitySelectProps = {
  value: string;
  onChange: (city: string) => void;
  name?: string;
  id?: string;
  placeholder?: string;
  icon?: React.ReactNode;
  surfaceClassName?: string;
  inputClassName?: string;
  autoComplete?: string;
};

export function CitySelect({
  value,
  onChange,
  name,
  id,
  placeholder = "Город",
  icon,
  surfaceClassName,
  inputClassName,
  autoComplete = "off",
}: CitySelectProps) {
  const [open, setOpen] = React.useState(false);
  // Печатал ли человек после того, как открыл список. Пока не печатал —
  // показываем список целиком, даже если город уже выбран: иначе в настройках
  // клик по заполненному полю не показывал ничего, и сменить город было нечем.
  const [isTyping, setIsTyping] = React.useState(false);

  const query = isTyping ? normalize(value) : "";
  const matches = query
    ? CITIES.filter((c) => normalize(c).includes(query))
    : [...CITIES];
  const showMenu = open && matches.length > 0;

  function select(city: string) {
    onChange(city);
    setOpen(false);
    setIsTyping(false);
  }

  return (
    <div className="relative">
      <GlassSurface className={surfaceClassName}>
        {icon}
        <input
          id={id}
          name={name}
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
          role="combobox"
          aria-expanded={showMenu}
          aria-autocomplete="list"
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
            setIsTyping(true);
          }}
          onFocus={() => {
            setOpen(true);
            setIsTyping(false);
          }}
          onBlur={() => {
            setOpen(false);
            setIsTyping(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
          className={inputClassName}
        />
      </GlassSurface>

      {showMenu && (
        <div className="absolute inset-x-0 top-[calc(100%+6px)] z-50">
          <GlassSurface className="max-h-60 overflow-y-auto rounded-[16px] border border-white/65 bg-white/70 py-1 shadow-[0_12px_30px_rgba(20,40,28,0.16)]">
            <ul role="listbox">
              {matches.map((city) => (
                <li key={city}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={city === value}
                    // onMouseDown срабатывает раньше onBlur инпута — выбор не теряется.
                    onMouseDown={(e) => {
                      e.preventDefault();
                      select(city);
                    }}
                    className="flex w-full cursor-pointer items-center px-4 py-2.5 text-left text-[15px] font-semibold text-[#15291C] hover:bg-white/60"
                  >
                    {city}
                  </button>
                </li>
              ))}
            </ul>
          </GlassSurface>
        </div>
      )}
    </div>
  );
}
