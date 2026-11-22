import { homeContent } from '../content/home'

/** @param {{categories: import('../lib/menuModel').MenuCategory[], selected: string, onSelect: (category: string) => void}} props */
export function CategoryFilter({ categories, selected, onSelect }) {
  return (
    <div role="group" aria-label={homeContent.menu.categoryLabel} className="flex flex-wrap gap-2">
      {categories.map((category) => (
        <button
          key={category.id}
          type="button"
          aria-pressed={selected === category.id}
          onClick={() => onSelect(category.id)}
          className={`min-h-11 rounded-full border px-5 py-2 text-sm font-medium transition-colors ${selected === category.id ? 'border-forest bg-forest text-white' : 'border-stone-300 bg-white text-stone-600 hover:border-forest hover:text-forest'}`}
        >
          {category.name}
        </button>
      ))}
    </div>
  )
}
