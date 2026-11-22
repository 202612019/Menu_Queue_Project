import { foodItems, categories } from '../../src/content/foodItems'

// Deterministic equivalents of the five seeded categories/eight menu rows.
export const categoryRows = categories.slice(1).map((name, index) => ({
  id: `c0000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, name, is_active: true,
}))
export const itemRows = foodItems.map((item, index) => ({
  id: `f0000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  name: item.name, description: item.description,
  category_id: categoryRows.find(category => category.name === item.category).id,
  price: (item.pricePaise / 100).toFixed(2), image_url: `/${item.image}`, is_available: item.available,
}))
export const catalogue = {
  categories: categoryRows.map(({ id, name }) => ({ id, name })),
  items: foodItems.map((item, index) => ({ ...item, id: itemRows[index].id, categoryId: itemRows[index].category_id })),
}
