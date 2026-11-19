import { useState } from 'react'
import { CartPanel } from '../components/CartPanel'
import { SiteHeader } from '../components/SiteHeader'
import { SiteFooter } from '../components/SiteFooter'
import { homeContent } from '../content/home'
import { HomePage } from '../pages/HomePage'

export function App() {
  // App is the shared parent of the header, food cards, and cart panel.
  // Updating this state re-renders all three with the same cart information.
  const [cartItems, setCartItems] = useState(/** @type {import('../content/foodItems').CartItem[]} */ ([]))
  const [cartOpen, setCartOpen] = useState(false)

  // Counts and totals are derived from the cart so they cannot fall out of sync.
  const cartCount = cartItems.reduce((count, line) => count + line.quantity, 0)
  const totalPaise = cartItems.reduce((total, line) => total + line.item.pricePaise * line.quantity, 0)

  /** @param {import('../content/foodItems').FoodItem} item */
  function addItem(item) {
    if (!item.available) return

    // The functional update uses the latest cart, even during rapid clicks.
    setCartItems((previous) => {
      const alreadyInCart = previous.some((line) => line.item.id === item.id)
      if (!alreadyInCart) return [...previous, { item, quantity: 1 }]

      return previous.map((line) => line.item.id === item.id ? { ...line, quantity: line.quantity + 1 } : line)
    })
  }

  /** @param {string} id @param {number} change */
  function changeQuantity(id, change) {
    setCartItems((previous) => previous.map((line) => (
      line.item.id === id ? { ...line, quantity: Math.max(1, line.quantity + change) } : line
    )))
  }

  /** @param {string} id */
  function removeItem(id) {
    setCartItems((previous) => previous.filter((line) => line.item.id !== id))
  }

  return (
    <div id="home" className="flex min-h-screen flex-col">
      <a href="#main-content" className="sr-only z-10 rounded-lg bg-white px-5 py-3 font-medium focus:not-sr-only focus:absolute focus:left-4 focus:top-4">
        {homeContent.skipLink}
      </a>
      <SiteHeader cartCount={cartCount} onOpenCart={() => setCartOpen(true)} />
      <HomePage onAdd={addItem} />
      <SiteFooter />
      <p role="status" className="sr-only">{homeContent.cart.countNotice}: {cartCount}</p>
      <CartPanel
        isOpen={cartOpen}
        items={cartItems}
        itemCount={cartCount}
        totalPaise={totalPaise}
        onClose={() => setCartOpen(false)}
        onChangeQuantity={changeQuantity}
        onRemove={removeItem}
      />
    </div>
  )
}
