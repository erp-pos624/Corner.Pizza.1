import { describe, expect, it } from 'vitest';
import { suggestIngredients } from './recipe-suggestions';

const ingredients = [
  ['ING-FLOUR', 'Pizza Flour'],
  ['ING-TOMATO', 'Tomato Sauce'],
  ['ING-MOZZ', 'Mozzarella Cheese'],
  ['ING-CHEDDAR', 'Cheddar'],
  ['ING-PEPPERONI', 'Pepperoni'],
  ['ING-CHICKEN', 'Grilled Chicken'],
  ['ING-BBQ', 'BBQ Sauce'],
  ['ING-OLIVES', 'Black Olives'],
  ['ING-TOMATO-FRESH', 'Fresh Tomato'],
  ['ING-POTATO', 'Potatoes'],
  ['ING-OIL', 'Cooking Oil'],
  ['ING-BOX', 'Pizza Boxes'],
  ['ING-BACON', 'Bacon'],
].map(([sku, name]) => ({ id: sku!.toLowerCase(), sku: sku!, name: name! }));

const skus = (list: ReturnType<typeof suggestIngredients>): string[] =>
  list.map((entry) => entry.ingredient.sku);

describe('suggestIngredients', () => {
  it('suggests dough, sauce, cheese and the box for a pizza', () => {
    const result = suggestIngredients(
      { nameEn: 'Margherita', descriptionEn: 'Tomato sauce with mozzarella', kind: 'PIZZA', categoryNameEn: 'Classic Pizzas' },
      ingredients,
    );
    expect(skus(result)).toEqual(['ING-FLOUR', 'ING-TOMATO', 'ING-MOZZ', 'ING-BOX']);
    // Tomato sauce must not also suggest fresh tomato.
    expect(skus(result)).not.toContain('ING-TOMATO-FRESH');
  });

  it('matches new ingredients by name and plural forms', () => {
    const result = suggestIngredients(
      { nameEn: 'Ranchero Chicken', descriptionEn: 'Ranch sauce, chicken, bacon, tomato, black olive', kind: 'PIZZA', categoryNameEn: 'Gourmet Pizzas' },
      ingredients,
    );
    expect(skus(result)).toEqual(
      expect.arrayContaining(['ING-CHICKEN', 'ING-BACON', 'ING-TOMATO-FRESH', 'ING-OLIVES']),
    );
  });

  it('adds frying oil for fried sides and no dough or box', () => {
    const result = suggestIngredients(
      { nameEn: 'French Fries', descriptionEn: 'Golden crispy French fries', kind: 'APPETIZER', categoryNameEn: 'Crispy Appetizers' },
      ingredients,
    );
    expect(skus(result)).toEqual(['ING-POTATO', 'ING-OIL']);
  });

  it('skips ingredients already in the recipe and suggests nothing for drinks', () => {
    const used = new Set(['ing-flour', 'ing-tomato']);
    const pizza = suggestIngredients(
      { nameEn: 'Margherita', descriptionEn: 'Tomato sauce with mozzarella', kind: 'PIZZA', categoryNameEn: 'Classic Pizzas' },
      ingredients,
      used,
    );
    expect(skus(pizza)).toEqual(['ING-MOZZ', 'ING-BOX']);
    expect(
      suggestIngredients({ nameEn: 'Bottled Water', descriptionEn: 'Pure mineral bottled water', kind: 'DRINK' }, ingredients),
    ).toEqual([]);
  });
});
