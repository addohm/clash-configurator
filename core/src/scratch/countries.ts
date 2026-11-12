/**
 * Which country a server is in, from its name: providers name servers by
 * flag, country, city or code ("🇭🇰 Hong Kong 01", "香港 02", "JP-Tokyo",
 * "[US] LA"). Scratch mode makes a fastest-server group per country from
 * this (PLAN.md Q23).
 */

export interface Country {
  code: string;
  flag: string;
  /** English name, used for the group. */
  name: string;
  /** Other words that mean it: names in English and Chinese, big cities. */
  words: string[];
}

export const COUNTRIES: readonly Country[] = [
  { code: 'HK', flag: '🇭🇰', name: 'Hong Kong', words: ['hong kong', 'hongkong', '香港'] },
  { code: 'TW', flag: '🇹🇼', name: 'Taiwan', words: ['taiwan', 'taipei', '台湾', '台灣', '台北'] },
  { code: 'MO', flag: '🇲🇴', name: 'Macau', words: ['macau', 'macao', '澳门', '澳門'] },
  { code: 'JP', flag: '🇯🇵', name: 'Japan', words: ['japan', 'tokyo', 'osaka', '日本', '东京', '東京', '大阪'] },
  { code: 'KR', flag: '🇰🇷', name: 'Korea', words: ['korea', 'seoul', '韩国', '韓國', '首尔'] },
  { code: 'SG', flag: '🇸🇬', name: 'Singapore', words: ['singapore', '新加坡', '狮城'] },
  { code: 'US', flag: '🇺🇸', name: 'United States', words: ['united states', 'usa', 'america', 'los angeles', 'san jose', 'seattle', 'new york', 'chicago', 'dallas', 'miami', 'silicon valley', '美国', '美國', '洛杉矶', '圣何塞', '西雅图', '纽约'] },
  { code: 'GB', flag: '🇬🇧', name: 'United Kingdom', words: ['united kingdom', 'britain', 'england', 'london', '英国', '英國', '伦敦'] },
  { code: 'DE', flag: '🇩🇪', name: 'Germany', words: ['germany', 'frankfurt', 'berlin', '德国', '德國', '法兰克福'] },
  { code: 'FR', flag: '🇫🇷', name: 'France', words: ['france', 'paris', '法国', '法國', '巴黎'] },
  { code: 'NL', flag: '🇳🇱', name: 'Netherlands', words: ['netherlands', 'amsterdam', '荷兰', '荷蘭'] },
  { code: 'CA', flag: '🇨🇦', name: 'Canada', words: ['canada', 'toronto', 'vancouver', 'montreal', '加拿大'] },
  { code: 'AU', flag: '🇦🇺', name: 'Australia', words: ['australia', 'sydney', 'melbourne', '澳大利亚', '澳洲'] },
  { code: 'IN', flag: '🇮🇳', name: 'India', words: ['india', 'mumbai', '印度'] },
  { code: 'RU', flag: '🇷🇺', name: 'Russia', words: ['russia', 'moscow', '俄罗斯', '俄羅斯'] },
  { code: 'TR', flag: '🇹🇷', name: 'Turkey', words: ['turkey', 'türkiye', 'istanbul', '土耳其'] },
  { code: 'MY', flag: '🇲🇾', name: 'Malaysia', words: ['malaysia', 'kuala lumpur', '马来西亚', '馬來西亞'] },
  { code: 'TH', flag: '🇹🇭', name: 'Thailand', words: ['thailand', 'bangkok', '泰国', '泰國'] },
  { code: 'VN', flag: '🇻🇳', name: 'Vietnam', words: ['vietnam', 'viet nam', 'hanoi', '越南'] },
  { code: 'PH', flag: '🇵🇭', name: 'Philippines', words: ['philippines', 'manila', '菲律宾', '菲律賓'] },
  { code: 'ID', flag: '🇮🇩', name: 'Indonesia', words: ['indonesia', 'jakarta', '印尼', '印度尼西亚'] },
  { code: 'AR', flag: '🇦🇷', name: 'Argentina', words: ['argentina', '阿根廷'] },
  { code: 'BR', flag: '🇧🇷', name: 'Brazil', words: ['brazil', 'são paulo', 'sao paulo', '巴西'] },
];

// "UK" is what most providers write for Great Britain.
const CODES: Record<string, string> = { UK: 'GB' };

/** The country a server name points to, or null. The flag counts first, then words, then a code on its own ("HK 01"). */
export function countryOf(name: string): Country | null {
  const byFlag = COUNTRIES.find((c) => name.includes(c.flag));
  if (byFlag) return byFlag;
  const lower = name.toLowerCase();
  // Latin words need word edges ("usa" in "jerusalem" isn't the US); Chinese ones don't have them.
  const has = (w: string) => (/^[\p{Script=Han}]+$/u.test(w) ? lower.includes(w) : new RegExp(`(^|[^\\p{L}])${w}($|[^\\p{L}])`, 'u').test(lower));
  const byWord = COUNTRIES.find((c) => c.words.some(has));
  if (byWord) return byWord;
  for (const m of name.matchAll(/(?:^|[^A-Za-z])([A-Z]{2})(?=$|[^A-Za-z])/g)) {
    const code = CODES[m[1] ?? ''] ?? m[1];
    const c = COUNTRIES.find((x) => x.code === code);
    if (c) return c;
  }
  return null;
}
