// Shopping categories and a keyword-based guesser for new items.

export const CATEGORIES = ['Produce', 'Bakery', 'Meat & seafood', 'Dairy', 'Pantry', 'Frozen', 'Drinks', 'Snacks', 'Baby & kids', 'Household', 'Personal care', 'Other'];

const KEYWORDS: [string, string[]][] = [
  ['Produce', ['lemon', 'lime', 'apple', 'banana', 'berr', 'broccoli', 'carrot', 'celery', 'garlic', 'onion', 'potato', 'tomato', 'lettuce', 'spinach', 'kale', 'pepper', 'cucumber', 'avocado', 'orange', 'grape', 'mushroom', 'zucchini', 'squash', 'herb', 'cilantro', 'parsley', 'basil', 'ginger', 'fruit', 'veg', 'corn', 'pear', 'peach', 'melon', 'cabbage']],
  ['Bakery', ['bread', 'bagel', 'bun', 'roll', 'tortilla', 'muffin', 'croissant', 'pita']],
  ['Meat & seafood', ['chicken', 'beef', 'pork', 'turkey', 'bacon', 'sausage', 'ham', 'steak', 'fish', 'salmon', 'shrimp', 'tuna', 'chuck', 'ground', 'thigh', 'breast']],
  ['Dairy', ['milk', 'cheese', 'yogurt', 'butter', 'cream', 'egg', 'sour cream', 'cottage', 'mozzarella', 'cheddar', 'parmesan', 'ricotta']],
  ['Frozen', ['frozen', 'ice cream', 'popsicle', 'pizza rolls', 'waffle']],
  ['Drinks', ['juice', 'soda', 'water', 'coffee', 'tea', 'seltzer', 'beer', 'wine']],
  ['Snacks', ['chip', 'cracker', 'cookie', 'pretzel', 'popcorn', 'granola', 'bar']],
  ['Baby & kids', ['diaper', 'wipe', 'formula', 'pouch', 'baby', 'pacifier', 'diaper cream', 'puffs']],
  ['Household', ['paper towel', 'toilet paper', 'trash bag', 'detergent', 'soap', 'sponge', 'foil', 'plastic wrap', 'cleaner', 'bleach', 'dish', 'battery', 'bulb', 'filter']],
  ['Personal care', ['shampoo', 'toothpaste', 'toothbrush', 'deodorant', 'lotion', 'razor', 'floss', 'tissue']],
  ['Pantry', ['rice', 'pasta', 'flour', 'sugar', 'oil', 'vinegar', 'salt', 'spice', 'oregano', 'cumin', 'bean', 'can', 'sauce', 'broth', 'stock', 'cereal', 'oat', 'peanut butter', 'jam', 'honey', 'syrup', 'noodle', 'soup', 'baking']],
];

export function guessCategory(name: string): string {
  const n = name.toLowerCase();
  for (const [cat, words] of KEYWORDS) if (words.some((w) => n.includes(w))) return cat;
  return 'Other';
}

/** Where a bought item goes in Inventory when a shopping trip is finished. */
export function guessLocation(category: string): 'pantry' | 'fridge' | 'freezer' | 'kids' {
  if (category === 'Frozen') return 'freezer';
  if (category === 'Dairy' || category === 'Meat & seafood') return 'fridge';
  if (category === 'Baby & kids') return 'kids';
  return 'pantry';
}

export const LOCATIONS: { id: 'pantry' | 'fridge' | 'freezer' | 'kids'; label: string }[] = [
  { id: 'pantry', label: 'Pantry' },
  { id: 'fridge', label: 'Fridge' },
  { id: 'freezer', label: 'Freezer' },
  { id: 'kids', label: 'Kids' },
];
