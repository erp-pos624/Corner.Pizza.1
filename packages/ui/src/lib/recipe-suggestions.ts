/**
 * Suggests tracked ingredients for a menu item from its name, description and
 * kind, for the recipe editor. Suggestions never carry a quantity: the chef
 * adds the ones that apply and enters every amount before anything is saved.
 */
import type { MenuKind } from '@posshope/shared';

export interface SuggestableIngredient {
  id: string;
  sku: string;
  name: string;
}

export interface SuggestableItem {
  nameEn: string;
  descriptionEn: string | null;
  kind: MenuKind;
  categoryNameEn?: string | null;
}

export interface IngredientSuggestion<T extends SuggestableIngredient = SuggestableIngredient> {
  ingredient: T;
  /** Why it was suggested, for the chip tooltip. */
  reason: 'description' | 'dough' | 'packaging' | 'frying';
}

/** Description phrase → ingredient SKU, for names that differ from the wording. */
const RULES: ReadonlyArray<[RegExp, string]> = [
  [/tomato sauce|marinara/u, 'ING-TOMATO'],
  [/mozzarella/u, 'ING-MOZZ'],
  [/cheddar/u, 'ING-CHEDDAR'],
  [/parmesan/u, 'ING-PARM'],
  [/\bbbq\b/u, 'ING-BBQ'],
  [/buffalo/u, 'ING-HOTSAUCE'],
  [/chicken/u, 'ING-CHICKEN'],
  [/italian sausage/u, 'ING-SAUSAGE'],
  [/mushroom/u, 'ING-MUSHROOM'],
  [/onion/u, 'ING-ONION'],
  [/green pepper/u, 'ING-PEPPERS'],
  [/\btomato(es)?\b(?! sauce)/u, 'ING-TOMATO-FRESH'],
  [/fries|wedges|potato/u, 'ING-POTATO'],
];

const BAKED = /pizza|calzone|rolls|breadsticks/u;
const FRIED = /fries|wedges|crispy|breaded|onion rings|tenders|wings/u;

function normalise(value: string): string {
  return value.toLowerCase().replace(/\s+/gu, ' ').trim();
}

/** "Black Olives" matches "black olives" or "black olive". */
function nameAppearsIn(text: string, name: string): boolean {
  const phrase = normalise(name);
  if (phrase.length < 3) return false;
  // "Olives" → "olive", "Tomatoes" → "tomato": try both plural endings.
  const forms = new Set([phrase, phrase.replace(/s$/u, ''), phrase.replace(/es$/u, '')]);
  const escaped = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const pattern = [...forms].filter((form) => form.length >= 3).map(escaped).join('|');
  return new RegExp(`\\b(${pattern})\\b`, 'u').test(text);
}

export function suggestIngredients<T extends SuggestableIngredient>(
  item: SuggestableItem,
  ingredients: readonly T[],
  alreadyUsed: ReadonlySet<string> = new Set(),
): IngredientSuggestion<T>[] {
  const text = normalise(`${item.nameEn} ${item.descriptionEn ?? ''}`);
  const scope = normalise(`${text} ${item.categoryNameEn ?? ''}`);
  const bySku = new Map(ingredients.map((ingredient) => [ingredient.sku, ingredient]));
  const picked = new Map<string, IngredientSuggestion<T>>();
  const add = (ingredient: T | undefined, reason: IngredientSuggestion['reason']): void => {
    if (!ingredient || alreadyUsed.has(ingredient.id) || picked.has(ingredient.id)) return;
    picked.set(ingredient.id, { ingredient, reason });
  };

  if (item.kind === 'PIZZA' || BAKED.test(scope)) add(bySku.get('ING-FLOUR'), 'dough');
  for (const [pattern, sku] of RULES) if (pattern.test(text)) add(bySku.get(sku), 'description');
  for (const ingredient of ingredients) {
    if (nameAppearsIn(text, ingredient.name)) add(ingredient, 'description');
  }
  if (FRIED.test(text)) add(bySku.get('ING-OIL'), 'frying');
  if (item.kind === 'PIZZA' && /pizza/u.test(scope)) add(bySku.get('ING-BOX'), 'packaging');
  return [...picked.values()];
}
