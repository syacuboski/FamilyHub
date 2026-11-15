// Natural-ish parsing for Quick add and recipe ingredient pasting.
import { guessCategory } from './categories';
import { addDays, startOfDay } from './dates';
import { parseQty } from './scale';
import { normalizeUnit } from './units';

const QTY = String.raw`(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?\s*[¼½¾⅓⅔⅛]?|[¼½¾⅓⅔⅛])`;

export interface ParsedItem {
  name: string;
  qty: number;
  unit: string;
  category: string;
}

/** "Milk 2 gal" | "2 gal milk" | "lemons x3" | "3 lemons" | "coffee" */
export function parseListItem(input: string): ParsedItem {
  let s = input.trim().replace(/\s+/g, ' ');
  let qty = 1;
  let unit = '';
  let m = s.match(/^(.*?)\s*[x×]\s*(\d+)$/i); // "lemons x3"
  if (m) {
    s = m[1];
    qty = Number(m[2]);
  } else if ((m = s.match(new RegExp(`^(.*?)\\s+${QTY}\\s*([A-Za-z]+\\.?)?$`)))) {
    // trailing quantity: "Milk 2 gal"
    const u = m[3] ? normalizeUnit(m[3], true) : null;
    if (!m[3] || u) {
      s = m[1];
      qty = parseQty(m[2]) || 1;
      unit = u || '';
    }
  } else if ((m = s.match(new RegExp(`^${QTY}\\s*([A-Za-z]+\\.?)?\\s+(.+)$`)))) {
    // leading quantity: "2 gal milk" / "3 lemons"
    const u = m[2] ? normalizeUnit(m[2], true) : null;
    if (u) {
      qty = parseQty(m[1]) || 1;
      unit = u;
      s = m[3];
    } else {
      qty = parseQty(m[1]) || 1;
      s = (m[2] ? m[2] + ' ' : '') + m[3];
    }
  }
  const name = s.charAt(0).toUpperCase() + s.slice(1);
  return { name, qty, unit, category: guessCategory(name) };
}

export interface ParsedIngredient {
  qty: number | null;
  unit: string;
  name: string;
  prep: string;
}

/** "2 lb beef chuck, cubed" → {2, lb, Beef chuck, cubed}; "salt to taste" → {null, to taste, Salt} */
export function parseIngredientLine(line: string): ParsedIngredient | null {
  let s = line.trim().replace(/^[-•*•]\s*/, '').replace(/\s+/g, ' ');
  if (!s) return null;
  let prep = '';
  const comma = s.indexOf(',');
  if (comma > 0) {
    prep = s.slice(comma + 1).trim();
    s = s.slice(0, comma).trim();
  }
  if (/\bto taste$/i.test(s)) {
    return { qty: null, unit: 'to taste', name: cap(s.replace(/\s*to taste$/i, '')), prep };
  }
  let qty: number | null = null;
  let unit = '';
  const m = s.match(new RegExp(`^${QTY}\\s*(.*)$`));
  if (m) {
    qty = parseQty(m[1].replace(/\s+/g, ' '));
    s = m[2];
    if (isNaN(qty)) qty = null;
    // two-word unit first ("fl oz"), then one word
    const two = s.match(/^(\S+\s+\S+)\s+(.*)$/);
    const one = s.match(/^(\S+)\s+(.*)$/);
    if (two && normalizeUnit(two[1])) {
      unit = normalizeUnit(two[1])!;
      s = two[2];
    } else if (one && normalizeUnit(one[1])) {
      unit = normalizeUnit(one[1])!;
      s = one[2];
    } else {
      unit = 'whole';
    }
    s = s.replace(/^of\s+/i, '');
  }
  return { qty, unit, name: cap(s), prep };
}

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export interface ParsedEvent {
  title: string;
  date: Date | null;
  time: string | null; // HH:MM start
  end: string | null; // HH:MM end, when a range like "4 to 6pm" was given
  /** member id when a name was mentioned, '' for "family"/"everyone", undefined if not said */
  owner?: string;
}

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const hm = (h: number, m: number) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
const to24 = (h: number, ap: string) => {
  if (ap.startsWith('p') && h < 12) return h + 12;
  if (ap.startsWith('a') && h === 12) return 0;
  return h;
};
const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface Person { id: string; name: string }

/**
 * "Dentist Fri 3pm" | "Book club tomorrow at 7" | "Haircut 11/20 10:30am"
 * | "Soccer Sat 4 to 6pm" | "Mom dentist Fri 3pm" | "Swim for Dad Thu 5:30-6:15pm"
 */
export function parseEventText(input: string, now = new Date(), people: Person[] = []): ParsedEvent {
  let s = ` ${input.trim()} `.replace(/\bnoon\b/gi, '12pm').replace(/\bmidnight\b/gi, '12am');
  let date: Date | null = null;
  let time: string | null = null;
  let end: string | null = null;
  let owner: string | undefined;
  const base = startOfDay(now);

  // who: a household member's name, or "family"/"everyone"
  for (const p of [...people].sort((a, b) => b.name.length - a.name.length)) {
    const re = new RegExp(`\\s(?:(for|with)\\s+)?${esc(p.name)}(?:'s)?(?=[\\s,.!?])`, 'i');
    const m = s.match(re);
    if (m) {
      owner = p.id;
      // "with Mom" stays in the title; "for Mom" and a bare "Mom" are removed
      if ((m[1] || '').toLowerCase() !== 'with') s = s.replace(m[0], ' ');
      break;
    }
  }
  if (owner === undefined) {
    const fm = s.match(/\s(?:for\s+)?(?:the\s+)?(family|everyone|all of us)(?=[\s,.!?])/i);
    if (fm) {
      owner = '';
      s = s.replace(fm[0], ' ');
    }
  }

  // time range: "4 to 6pm", "from 4-6", "5:30–6:15pm", "11am until 1pm"
  const rm = s.match(/\s(?:(?:from|at)\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?\s*(?:-|–|—|to|until|till|til)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?(?=\s)/i);
  if (rm) {
    let h1 = Number(rm[1]), h2 = Number(rm[4]);
    const m1 = Number(rm[2] || 0), m2 = Number(rm[5] || 0);
    let ap1 = (rm[3] || '').toLowerCase(), ap2 = (rm[6] || '').toLowerCase();
    if (h1 <= 12 && h2 <= 12 && m1 < 60 && m2 < 60) {
      if (!ap1 && !ap2) {
        // no am/pm at all: a start of 1–7 means afternoon/evening, like "at 7";
        // 8–11 is morning, ending after noon if the end hour wraps ("11 to 1")
        if (h1 >= 1 && h1 <= 7) ap1 = ap2 = 'pm';
        else if (h1 === 12) ap1 = ap2 = 'pm';
        else {
          ap1 = 'am';
          ap2 = h2 < h1 || h2 === 12 ? 'pm' : 'am';
        }
      }
      if (!ap2) ap2 = ap1;
      if (!ap1) {
        // "4 to 6pm" → 4pm; "11 to 1pm" → 11am
        ap1 = ap2;
        if (ap2.startsWith('p') && h1 !== 12 && h1 > h2 && h2 !== 12) ap1 = 'am';
      }
      h1 = to24(h1, ap1);
      h2 = to24(h2, ap2);
      time = hm(h1, m1);
      end = hm(h2, m2);
      s = s.replace(rm[0], ' ');
    }
  }

  // single time
  if (!time) {
    const tm = s.match(/\s(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?(?=\s)/i);
    if (tm && (tm[3] || tm[2] || /\sat\s+\d/i.test(s))) {
      let h = Number(tm[1]);
      const mi = Number(tm[2] || 0);
      const ap = (tm[3] || '').toLowerCase();
      h = to24(h, ap);
      if (!ap && h >= 1 && h <= 7) h += 12; // "at 7" most likely means evening
      if (h < 24 && mi < 60) {
        time = hm(h, mi);
        s = s.replace(tm[0], ' ');
      }
    }
  }

  // date words
  let dm;
  if ((dm = s.match(/\s(today|tonight)(?=\s)/i))) {
    date = base;
    s = s.replace(dm[0], ' ');
    if (dm[1].toLowerCase() === 'tonight' && !time) time = '19:00';
  } else if ((dm = s.match(/\s(tomorrow|tmrw)(?=\s)/i))) {
    date = addDays(base, 1);
    s = s.replace(dm[0], ' ');
  } else if ((dm = s.match(/\s(?:on\s+)?(next\s+)?(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)[a-z]*(?=\s)/i))) {
    const want = DAYS.indexOf(dm[2].toLowerCase().slice(0, 3));
    let diff = (want - base.getDay() + 7) % 7;
    if (diff === 0) diff = 7;
    if (dm[1]) diff += diff < 7 ? 7 : 0;
    date = addDays(base, diff);
    s = s.replace(dm[0], ' ');
  } else if ((dm = s.match(/\s(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?=\s)/))) {
    const y = dm[3] ? (dm[3].length === 2 ? 2000 + Number(dm[3]) : Number(dm[3])) : base.getFullYear();
    date = new Date(y, Number(dm[1]) - 1, Number(dm[2]));
    if (!dm[3] && date < base) date = new Date(y + 1, Number(dm[1]) - 1, Number(dm[2]));
    s = s.replace(dm[0], ' ');
  } else if ((dm = s.match(/\s(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?=\s)/i))) {
    const mo = MONTHS.indexOf(dm[1].toLowerCase().slice(0, 3));
    date = new Date(base.getFullYear(), mo, Number(dm[2]));
    if (date < base) date = new Date(base.getFullYear() + 1, mo, Number(dm[2]));
    s = s.replace(dm[0], ' ');
  }

  const title = cap(s.replace(/\s+(on|at)\s*$/i, '').replace(/\s+/g, ' ').trim());
  return { title, date, time, end, owner };
}
