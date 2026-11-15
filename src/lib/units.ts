// Units offered in recipe entry (grouped like the mockup) and their aliases.

export const UNIT_GROUPS: { label: string; units: string[] }[] = [
  { label: 'Volume', units: ['tsp', 'tbsp', 'fl oz', 'cup', 'pint', 'quart', 'gallon', 'ml', 'liter'] },
  { label: 'Weight', units: ['oz', 'lb', 'g', 'kg'] },
  { label: 'Count', units: ['whole', 'clove', 'slice', 'stick', 'can', 'jar', 'package', 'bunch', 'head', 'sprig'] },
  { label: 'Small amounts', units: ['pinch', 'dash', 'to taste'] },
];

export const ALL_UNITS = UNIT_GROUPS.flatMap((g) => g.units);

const ALIASES: Record<string, string> = {
  t: 'tsp', tsp: 'tsp', tsps: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp',
  T: 'tbsp', tbsp: 'tbsp', tbsps: 'tbsp', tbs: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp',
  'fl oz': 'fl oz', floz: 'fl oz',
  c: 'cup', cup: 'cup', cups: 'cup',
  pt: 'pint', pint: 'pint', pints: 'pint',
  qt: 'quart', quart: 'quart', quarts: 'quart',
  gal: 'gallon', gallon: 'gallon', gallons: 'gallon',
  ml: 'ml', milliliter: 'ml', milliliters: 'ml',
  l: 'liter', liter: 'liter', liters: 'liter', litre: 'liter', litres: 'liter',
  oz: 'oz', ounce: 'oz', ounces: 'oz',
  lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
  g: 'g', gram: 'g', grams: 'g',
  kg: 'kg', kilogram: 'kg', kilograms: 'kg',
  whole: 'whole', clove: 'clove', cloves: 'clove', slice: 'slice', slices: 'slice', stick: 'stick', sticks: 'stick',
  can: 'can', cans: 'can', jar: 'jar', jars: 'jar', package: 'package', packages: 'package', pkg: 'package', packet: 'package',
  bunch: 'bunch', bunches: 'bunch', head: 'head', heads: 'head', sprig: 'sprig', sprigs: 'sprig',
  pinch: 'pinch', dash: 'dash',
};

/** Shopping list units are looser than recipe units (box, bag, dz...). */
const LIST_ALIASES: Record<string, string> = {
  ...ALIASES,
  dz: 'dz', dozen: 'dz', box: 'box', boxes: 'box', bx: 'box', bag: 'bag', bags: 'bag', bn: 'bunch', hd: 'head',
  pack: 'pack', packs: 'pack', bottle: 'bottle', bottles: 'bottle', roll: 'roll', rolls: 'roll', ct: 'ct', count: 'ct',
  tub: 'tub', tubs: 'tub',
};

export function normalizeUnit(raw: string, list = false): string | null {
  const k = raw.trim().replace(/\.$/, '');
  const map = list ? LIST_ALIASES : ALIASES;
  if (map[k]) return map[k];
  const lower = k.toLowerCase();
  return map[lower] ?? null;
}

/** Short unit for list rows: "1 gal", "×2" when no unit */
export function fmtListQty(qty: number | undefined, unit: string | undefined): string {
  const q = qty || 0;
  if (!unit) return q > 1 ? `×${q}` : q === 1 ? '1' : '';
  const short: Record<string, string> = { gallon: 'gal', bunch: 'bn', head: 'hd', package: 'pkg', box: 'bx' };
  return `${q || 1} ${short[unit] || unit}`;
}
