import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Link, Route, Routes, useLocation, useNavigate } from 'react-router'
import { CartPanel } from '../components/CartPanel'
import { SiteHeader } from '../components/SiteHeader'
import { SiteFooter } from '../components/SiteFooter'
import { homeContent } from '../content/home'
import { HomePage } from '../pages/HomePage'
import { AccountPage } from '../pages/AccountPage'
import { AuthCallbackPage, ForgotPasswordPage, LoginPage, RegisterPage, ResetPasswordPage } from '../pages/AuthPages'
import { AuthLayout, AuthMessage } from '../components/AuthLayout'
import { RequireAuth, RequireRecovery } from '../auth/AuthGuards'
import { useAuth } from '../auth/AuthProvider'
import { initialAuthLink } from '../auth/authLinks'
import { authContent } from '../content/auth'

const ConnectionTestPage = import.meta.env.DEV ? lazy(() => import('../pages/SupabaseConnectionTest')) : null

export function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const auth = useAuth()
  const linkHandled = useRef(false)
  // App is the shared parent of the header, food cards, and cart panel.
  // Updating this state re-renders all three with the same cart information.
  const [cartItems, setCartItems] = useState(/** @type {import('../content/foodItems').CartItem[]} */ ([]))
  const [cartOpen, setCartOpen] = useState(false)

  useEffect(() => {
    setCartOpen(false)
    if (!linkHandled.current) {
      linkHandled.current = true
      // Also handle confirmation links sent to the project's default Site URL.
      if (initialAuthLink.present && location.pathname !== '/auth/callback') {
        // Preserve an unconsumed URL for an SDK-owned initialization retry.
        navigate(`/auth/callback${window.location.search}${window.location.hash}`, { replace: true })
        return
      }
    }
    const frame = requestAnimationFrame(() => {
      const target = location.hash ? document.getElementById(location.hash.slice(1)) : null
      if (target) target.scrollIntoView({ block: 'start' })
      else window.scrollTo(0, 0)
    })
    return () => cancelAnimationFrame(frame)
  }, [location.pathname, location.hash, navigate])

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
      {auth.logoutWarning && <div className="page-container mt-4"><AuthMessage error message={auth.logoutWarning} /></div>}
      <Suspense fallback={<AuthLayout title={authContent.loading} />}>
        <Routes>
          <Route path="/" element={<HomePage onAdd={addItem} />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<RequireRecovery><ResetPasswordPage /></RequireRecovery>} />
          <Route path="/account" element={<RequireAuth><AccountPage /></RequireAuth>} />
          {ConnectionTestPage && <Route path="/supabase-test" element={<ConnectionTestPage />} />}
          <Route path="*" element={<AuthLayout title={authContent.notFound} description={authContent.notFoundDescription}><Link to="/" className="text-forest underline">{authContent.home}</Link></AuthLayout>} />
        </Routes>
      </Suspense>
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
