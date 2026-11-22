import { FoodCard } from './FoodCard'
import { homeContent } from '../content/home'

/** @param {{items: import('../content/foodItems').FoodItem[], onAdd: (item: import('../content/foodItems').FoodItem) => void, onClear: () => void, canAdd: boolean, canAddItem: (id: string) => boolean, emptyTitle: string, emptyDescription: string, showClear: boolean}} props */
export function FoodGrid({ items, onAdd, onClear, canAdd, canAddItem, emptyTitle, emptyDescription, showClear }) {
  if (items.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-stone-300 bg-white px-6 py-16 text-center">
        <h3 className="text-xl font-semibold">{emptyTitle}</h3>
        <p className="mt-3 text-base text-stone-600">{emptyDescription}</p>
        {showClear && <button type="button" onClick={onClear} className="button-primary mt-6">{homeContent.menu.clearFilters}</button>}
      </div>
    )
  }

  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((item) => (
        <li key={item.id}><FoodCard item={item} onAdd={onAdd} canAdd={canAdd && canAddItem(item.id)} /></li>
      ))}
    </ul>
  )
}
