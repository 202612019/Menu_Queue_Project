/** @typedef {{id: string, name: string}} MenuCategory */
/** @typedef {import('../content/foodItems').FoodItem & {categoryId: string}} MenuItem */
/** @typedef {{categories: MenuCategory[], items: MenuItem[]}} Catalogue */
/** @typedef {{id: string, name: string, is_active: boolean}} CategoryRow */
/** @typedef {{id: string, name: string, description: string, category_id: string, price: number|string, image_url: string|null, is_available: boolean}} MenuRow */

// Parse the decimal representation, rather than multiplying a binary fraction.
// This is the only rupees-to-paise conversion in the production menu pipeline.
/** @param {number|string} price */
export function rupeesToPaise(price) {
  const value = String(price)
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) throw new RangeError('Invalid menu price')
  const [whole, fraction = ''] = value.split('.')
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(paise) || paise < 0) throw new RangeError('Invalid menu price')
  return paise
}

/** @param {CategoryRow[]} categoryRows @param {MenuRow[]} itemRows @returns {Catalogue} */
export function mapMenu(categoryRows, itemRows) {
  const categories = categoryRows.filter(category => category.is_active === true).map(category => {
    if (!category.id || !category.name?.trim()) throw new RangeError('Invalid menu category')
    return { id: category.id, name: category.name }
  })
  const names = new Map(categories.map(category => [category.id, category.name]))
  const items = itemRows.filter(item => names.has(item.category_id)).map(item => {
    if (!item.id || !item.name?.trim() || typeof item.is_available !== 'boolean') throw new RangeError('Invalid menu item')
    return {
      id: item.id, name: item.name, description: item.description ?? '',
      categoryId: item.category_id, category: names.get(item.category_id) ?? '',
      pricePaise: rupeesToPaise(item.price), image: item.image_url ?? '',
      imageAlt: item.name, available: item.is_available,
    }
  })
  return { categories, items }
}
