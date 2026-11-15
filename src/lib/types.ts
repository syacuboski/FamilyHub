// Record shapes as stored in PocketBase (and mirrored in IndexedDB).

export interface BaseRec {
  id: string;
  household: string;
  created?: string;
  updated?: string;
  /** set locally while a change is waiting to sync */
  _pending?: boolean;
}

export interface User {
  id: string;
  name: string;
  email?: string;
  color: string;
  role: 'admin' | 'adult' | 'kid';
  household: string;
  prefs?: Record<string, unknown> | null;
}

export interface Item extends BaseRec { name: string; name_key?: string; default_unit: string; category: string }

export type ListKind = 'store' | 'errands' | 'wish' | 'other';
export interface List extends BaseRec { name: string; kind: ListKind; sort: number; color: string; shared: boolean }

export interface ListItem extends BaseRec {
  list: string;
  item?: string;
  name: string;
  qty: number;
  unit: string;
  category: string;
  checked: boolean;
  checked_by?: string;
  checked_at?: string;
  check_order?: number;
  source?: string;
}

export interface Store extends BaseRec { name: string; category_order: string[] | null; sort: number }

export interface Task extends BaseRec {
  title: string;
  notes?: string;
  due: string;
  due_time?: string;
  rrule?: string;
  assignee?: string;
  done: boolean;
  done_at?: string;
  last_done?: string;
  remind?: boolean;
  source?: string;
}

export interface CalEvent extends BaseRec {
  title: string;
  start: string;
  end?: string;
  all_day: boolean;
  rrule?: string;
  exdates?: string[] | null;
  owner?: string;
  reminder_min?: number;
  location?: string;
  notes?: string;
  external_id?: string;
}

export interface Step { text: string; timer_min?: number }

export interface Recipe extends BaseRec {
  title: string;
  servings: number;
  prep_min?: number;
  cook_min?: number;
  steps: Step[] | null;
  tags: string[] | null;
  photo?: string;
  kid_portion?: number;
  portion_weight?: number;
  weight_unit?: string;
  protein?: number;
  carbs?: number;
  fat?: number;
  reheat?: string;
  notes?: string;
  source_url?: string;
}

export interface RecipeIngredient extends BaseRec {
  recipe: string;
  item?: string;
  name: string;
  qty: number | null;
  unit: string;
  prep?: string;
  sort: number;
}

export interface Tag extends BaseRec { name: string; group: string; show: boolean; sort: number }

export type Slot = 'breakfast' | 'lunch' | 'dinner';
export interface MenuEntry extends BaseRec {
  date: string;
  slot: Slot;
  recipe?: string;
  text?: string;
  note?: string;
  is_prep?: boolean;
  adults?: number;
  kids?: number;
  prep_adult?: number;
  prep_kid?: number;
}

export type Location = 'pantry' | 'fridge' | 'freezer' | 'kids';
export interface InventoryRec extends BaseRec {
  item?: string;
  name: string;
  location: Location;
  qty: number;
  unit: string;
  low: number;
  par: number;
  expires_on?: string;
  note?: string;
}

export interface InvCheck extends BaseRec { location: string; checked_at: string }
export interface BagItem extends BaseRec { name: string; target_qty: number; inventory?: string; packed: boolean; sort: number }

export interface Household { id: string; name: string; timezone?: string }

export interface CollectionMap {
  users: User;
  households: Household;
  items: Item;
  lists: List;
  list_items: ListItem;
  stores: Store;
  tasks: Task;
  events: CalEvent;
  recipes: Recipe;
  recipe_ingredients: RecipeIngredient;
  tags: Tag;
  menu_entries: MenuEntry;
  inventory: InventoryRec;
  inv_checks: InvCheck;
  bag_items: BagItem;
}
export type CollectionName = keyof CollectionMap;
