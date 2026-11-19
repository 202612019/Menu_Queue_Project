import { useState } from 'react'
import { homeContent } from '../content/home'
import { CartIcon, CloseIcon, MenuIcon, SearchIcon } from './Icons'

/** @param {{cartCount: number, onOpenCart: () => void}} props */
export function SiteHeader({ cartCount, onOpenCart }) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="sticky top-0 z-30 border-b border-stone-200 bg-[#f8f9f5]/95 backdrop-blur-md">
      <div className="page-container flex min-h-21 items-center justify-between gap-3">
        <a href="#home" className="flex min-h-11 items-center gap-2 rounded-md sm:gap-3">
          <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-forest text-xl font-bold text-white">C</span>
          <span className="max-w-21 text-sm font-bold leading-tight sm:max-w-none sm:text-lg">{homeContent.title}</span>
        </a>
        <nav aria-label={homeContent.navigationLabel} className="hidden items-center gap-8 text-sm font-medium md:flex">
          {homeContent.navigation.map((link) => (
            <a key={link.href} href={link.href} className="flex min-h-11 items-center rounded-md text-stone-600 hover:text-forest">{link.label}</a>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-1 sm:gap-3">
          <a href="#menu-search" aria-label={homeContent.searchLink} className="flex size-11 items-center justify-center rounded-full text-forest hover:bg-stone-200"><SearchIcon /></a>
          <button type="button" onClick={onOpenCart} aria-label={`${homeContent.cart.open} (${cartCount})`} className="relative inline-flex size-11 items-center justify-center rounded-full border border-forest text-forest hover:bg-[#e8eee3] sm:w-auto sm:gap-2 sm:px-4">
            <CartIcon />
            <span className="hidden text-sm font-semibold sm:inline">{homeContent.cart.label}</span>
            <span className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-forest px-1.5 text-xs font-semibold leading-5 text-white sm:static">{cartCount}</span>
          </button>
          <button
            type="button"
            onClick={() => setMenuOpen((previous) => !previous)}
            aria-label={menuOpen ? homeContent.closeNavigation : homeContent.openNavigation}
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
            className="flex size-11 items-center justify-center rounded-full text-forest hover:bg-stone-200 md:hidden"
          >
            {menuOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>
      {menuOpen && (
        <nav id="mobile-navigation" aria-label={homeContent.mobileNavigationLabel} className="page-container border-t border-stone-200 py-3 md:hidden">
          {homeContent.navigation.map((link) => (
            <a key={link.href} href={link.href} onClick={() => setMenuOpen(false)} className="flex min-h-12 items-center rounded-md text-base font-medium text-forest">{link.label}</a>
          ))}
        </nav>
      )}
    </header>
  )
}
