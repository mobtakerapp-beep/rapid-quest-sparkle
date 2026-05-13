const FLAG_MAP: Record<string, string> = {
  "عُمان": "🇴🇲", "عمان": "🇴🇲", "سلطنة عُمان": "🇴🇲", "سلطنة عمان": "🇴🇲", "Oman": "🇴🇲",
  "السعودية": "🇸🇦", "المملكة العربية السعودية": "🇸🇦", "Saudi Arabia": "🇸🇦",
  "الإمارات": "🇦🇪", "الإمارات العربية المتحدة": "🇦🇪", "UAE": "🇦🇪", "United Arab Emirates": "🇦🇪",
  "الكويت": "🇰🇼", "Kuwait": "🇰🇼",
  "قطر": "🇶🇦", "Qatar": "🇶🇦",
  "البحرين": "🇧🇭", "Bahrain": "🇧🇭",
  "اليمن": "🇾🇪", "Yemen": "🇾🇪",
  "الأردن": "🇯🇴", "Jordan": "🇯🇴",
  "مصر": "🇪🇬", "Egypt": "🇪🇬",
  "العراق": "🇮🇶", "Iraq": "🇮🇶",
  "سوريا": "🇸🇾", "Syria": "🇸🇾",
  "لبنان": "🇱🇧", "Lebanon": "🇱🇧",
  "فلسطين": "🇵🇸", "Palestine": "🇵🇸",
  "المغرب": "🇲🇦", "Morocco": "🇲🇦",
  "تونس": "🇹🇳", "Tunisia": "🇹🇳",
  "الجزائر": "🇩🇿", "Algeria": "🇩🇿",
  "ليبيا": "🇱🇾", "Libya": "🇱🇾",
  "السودان": "🇸🇩", "Sudan": "🇸🇩",
  "الصومال": "🇸🇴", "Somalia": "🇸🇴",
  "جيبوتي": "🇩🇯", "Djibouti": "🇩🇯",
  "موريتانيا": "🇲🇷", "Mauritania": "🇲🇷",
  "جزر القمر": "🇰🇲", "Comoros": "🇰🇲",
  "السودان الجنوبي": "🇸🇸", "South Sudan": "🇸🇸",
};

export const ARAB_COUNTRIES: { name: string; flag: string }[] = [
  { name: "سلطنة عُمان",              flag: "🇴🇲" },
  { name: "المملكة العربية السعودية", flag: "🇸🇦" },
  { name: "الإمارات العربية المتحدة", flag: "🇦🇪" },
  { name: "الكويت",                   flag: "🇰🇼" },
  { name: "قطر",                      flag: "🇶🇦" },
  { name: "البحرين",                  flag: "🇧🇭" },
  { name: "اليمن",                    flag: "🇾🇪" },
  { name: "الأردن",                   flag: "🇯🇴" },
  { name: "مصر",                      flag: "🇪🇬" },
  { name: "العراق",                   flag: "🇮🇶" },
  { name: "سوريا",                    flag: "🇸🇾" },
  { name: "لبنان",                    flag: "🇱🇧" },
  { name: "فلسطين",                   flag: "🇵🇸" },
  { name: "المغرب",                   flag: "🇲🇦" },
  { name: "تونس",                     flag: "🇹🇳" },
  { name: "الجزائر",                  flag: "🇩🇿" },
  { name: "ليبيا",                    flag: "🇱🇾" },
  { name: "السودان",                  flag: "🇸🇩" },
  { name: "الصومال",                  flag: "🇸🇴" },
  { name: "جيبوتي",                   flag: "🇩🇯" },
  { name: "موريتانيا",                flag: "🇲🇷" },
  { name: "جزر القمر",                flag: "🇰🇲" },
  { name: "السودان الجنوبي",          flag: "🇸🇸" },
];

export function getCountryFlag(country: string): string {
  if (!country) return "";
  const trimmed = country.trim();
  if (FLAG_MAP[trimmed]) return FLAG_MAP[trimmed];
  const lower = trimmed.toLowerCase();
  for (const [key, flag] of Object.entries(FLAG_MAP)) {
    if (key.toLowerCase() === lower) return flag;
  }
  return "";
}
