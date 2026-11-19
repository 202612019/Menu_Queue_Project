import { homeContent } from '../content/home'
import { formatPrice } from '../utils/currency'

/** @param {{item: import('../content/foodItems').FoodItem, onAdd: (item: import('../content/foodItems').FoodItem) => void}} props */
export function FoodCard({ item, onAdd }) {
  return (
    <article aria-labelledby={`food-${item.id}`} className="flex h-full flex-col overflow-hidden rounded-3xl border border-stone-200 bg-white">
      <img
        src={`${import.meta.env.BASE_URL}${item.image}`}
        alt={item.imageAlt}
        width="800"
        height="600"
        loading="lazy"
        className={`aspect-[4/3] w-full bg-stone-100 object-cover ${item.available ? '' : 'opacity-60'}`}
      />
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center justify-between gap-2 text-sm">
          <p className="text-stone-500">{item.category}</p>
          <p className={item.available ? 'font-medium text-forest' : 'font-medium text-stone-500'}>
            {item.available ? homeContent.menu.available : homeContent.menu.unavailable}
          </p>
        </div>
        <h3 id={`food-${item.id}`} className="mt-3 text-xl font-semibold tracking-tight">{item.name}</h3>
        <p className="mb-6 mt-2 flex-1 text-sm leading-relaxed text-stone-600">{item.description}</p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xl font-semibold text-forest">{formatPrice(item.pricePaise)}</p>
          <button
            type="button"
            disabled={!item.available}
            onClick={() => onAdd(item)}
            aria-label={`${homeContent.menu.add}, ${item.name}`}
            className="min-h-11 rounded-full border border-forest px-4 py-2 text-sm font-semibold text-forest transition-colors hover:bg-forest hover:text-white disabled:cursor-not-allowed disabled:border-stone-200 disabled:bg-stone-100 disabled:text-stone-500"
          >
            {homeContent.menu.add}
          </button>
        </div>
      </div>
    </article>
  )
}
