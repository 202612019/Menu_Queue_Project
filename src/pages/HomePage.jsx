import { useState } from 'react'
import { CategoryFilter } from '../components/CategoryFilter'
import { FoodGrid } from '../components/FoodGrid'
import { HeroSection } from '../components/HeroSection'
import { SearchIcon } from '../components/Icons'
import { homeContent } from '../content/home'

/** @param {{onAdd: (item: import('../content/foodItems').FoodItem) => void, menu: ReturnType<typeof import('../hooks/useMenu').useMenu>}} props */
export function HomePage({ onAdd, menu }) {
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')

  const foodItems = menu.data?.items ?? []
  const categories = [{ id: 'All', name: homeContent.menu.all }, ...(menu.data?.categories ?? [])]
  // An archived selection returns to All without briefly displaying hidden foods.
  const activeCategory = categories.some(category => category.id === selectedCategory) ? selectedCategory : 'All'
  const visibleItems = foodItems.filter((item) => {
    const matchesCategory = activeCategory === 'All' || item.categoryId === activeCategory
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
    return matchesCategory && matchesSearch
  })

  function clearFilters() {
    setSelectedCategory('All')
    setSearchQuery('')
  }

  return (
    <main id="main-content" tabIndex={-1} className="page-container">
      <HeroSection />
      <section id="menu" aria-labelledby="menu-title" className="scroll-mt-28 border-t border-stone-200 pb-14 pt-12 sm:pb-20">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <h2 id="menu-title" className="text-3xl font-semibold tracking-tight sm:text-4xl">{homeContent.menu.title}</h2>
            <p className="mt-3 text-base text-stone-600">{homeContent.menu.description}</p>
          </div>
          <div className="relative w-full md:max-w-sm">
            <label htmlFor="menu-search" className="sr-only">{homeContent.menu.searchLabel}</label>
            <span className="pointer-events-none absolute left-4 top-4 text-stone-500"><SearchIcon /></span>
            <input
              id="menu-search"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={homeContent.menu.searchPlaceholder}
              autoComplete="off"
              className="min-h-13 w-full scroll-mt-36 rounded-full border border-stone-300 bg-white py-3 pl-12 pr-4 text-base placeholder:text-stone-500"
            />
          </div>
        </div>
        <div className="mt-7"><CategoryFilter categories={categories} selected={activeCategory} onSelect={setSelectedCategory} /></div>
        <div className="my-5 flex flex-col justify-between gap-2 text-sm text-stone-500 sm:flex-row">
          <p>{homeContent.menu.demoNotice}</p>
          <div className="flex flex-wrap items-center gap-4">
            {menu.data && <p aria-live="polite" aria-atomic="true">{visibleItems.length} {visibleItems.length === 1 ? homeContent.menu.dish : homeContent.menu.dishes}</p>}
            <button type="button" disabled={menu.loading} onClick={menu.refresh} className="min-h-11 underline underline-offset-4 disabled:opacity-50">{homeContent.menu.refresh}</button>
          </div>
        </div>
        {menu.loading && <p role="status" className="mb-5 rounded-2xl bg-stone-100 p-5">{menu.data ? homeContent.menu.refreshing : homeContent.menu.loading}</p>}
        {menu.error && <div role="alert" className="mb-5 rounded-2xl border border-stone-200 bg-white p-5">
          <p>{menu.error}</p>
          <button type="button" onClick={menu.refresh} className="button-primary mt-4">{homeContent.menu.retry}</button>
        </div>}
        {menu.data && <FoodGrid items={visibleItems} onAdd={onAdd} onClear={clearFilters} canAdd={menu.ready}
          emptyTitle={foodItems.length === 0 ? homeContent.menu.emptyCatalogue : searchQuery.trim() ? homeContent.menu.emptyTitle : homeContent.menu.emptyCategory}
          emptyDescription={searchQuery.trim() ? homeContent.menu.emptyDescription : homeContent.menu.emptyHint}
          showClear={activeCategory !== 'All' || Boolean(searchQuery.trim())} />}
      </section>
      <section id="about" aria-labelledby="about-title" className="grid scroll-mt-28 gap-6 rounded-[2rem] bg-[#e8eee3] p-7 sm:p-10 lg:grid-cols-2 lg:gap-16">
        <h2 id="about-title" className="max-w-sm text-3xl font-medium leading-tight tracking-tight sm:text-4xl">{homeContent.aboutTitle}</h2>
        <div className="max-w-xl space-y-4 text-base leading-relaxed text-stone-600">
          <p>{homeContent.aboutDescription}</p>
          <p>{homeContent.aboutPurpose}</p>
        </div>
      </section>
    </main>
  )
}
