import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { homeContent } from '../content/home'
import { formatPrice } from '../utils/currency'
import { CloseIcon } from './Icons'
import { MenuImage } from './MenuImage'

/**
 * @param {{
 *   isOpen: boolean,
 *   items: import('../content/foodItems').CartItem[],
 *   itemCount: number,
 *   totalPaise: number,
 *   catalogue: import('../lib/menuModel').Catalogue|null,
 *   menuReady: boolean,
 *   onClose: () => void,
 *   onChangeQuantity: (id: string, change: number) => void,
 *   onRemove: (id: string) => void
 * }} props
 */
export function CartPanel({ isOpen, items, itemCount, totalPaise, catalogue, menuReady, onClose, onChangeQuantity, onRemove }) {
  const dialogRef = useRef(/** @type {HTMLDialogElement | null} */ (null))
  const [pendingRemoval, setPendingRemoval] = useState(/** @type {string | null} */ (null))

  // A native modal makes the background inert and restores focus to the opener on close.
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (isOpen && !dialog.open) dialog.showModal()
    if (!isOpen && dialog.open) dialog.close()
  }, [isOpen])

  function handleClose() {
    setPendingRemoval(null)
    onClose()
  }

  return (
    <dialog ref={dialogRef} onClose={handleClose} aria-labelledby="cart-title" aria-describedby="cart-demo-notice" className="cart-dialog">
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-stone-200 p-6">
        <div>
          <h2 id="cart-title" className="text-2xl font-semibold tracking-tight">{homeContent.cart.title}</h2>
          <p className="mt-1 text-sm text-stone-500">{itemCount} {itemCount === 1 ? homeContent.cart.item : homeContent.cart.items}</p>
        </div>
        <button type="button" autoFocus onClick={handleClose} aria-label={homeContent.cart.close} className="flex size-11 shrink-0 items-center justify-center rounded-full border border-stone-300 hover:bg-stone-100"><CloseIcon /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6">
        {items.length > 0 && !menuReady && <p role="status" className="mb-5 text-sm text-stone-600">{homeContent.cart.menuPending}</p>}
        {items.length === 0 ? (
          <div className="py-16 text-center">
            <h3 className="text-xl font-semibold">{homeContent.cart.emptyTitle}</h3>
            <p className="mx-auto mt-3 max-w-xs text-base leading-relaxed text-stone-600">{homeContent.cart.emptyDescription}</p>
            <Link to="/#menu" onClick={handleClose} className="button-primary mt-6">{homeContent.cart.browse}</Link>
          </div>
        ) : (
          <ul className="space-y-6">
            {items.map(({ item, quantity }) => {
              const current = catalogue?.items.find(candidate => candidate.id === item.id)
              return (
              <li key={item.id} className="border-b border-stone-200 pb-6">
                <div className="flex gap-4">
                  <MenuImage src={item.image} alt={item.name} width={80} height={80} className="size-20 shrink-0 rounded-2xl object-cover" />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-semibold">{item.name}</h3>
                    <p className="mt-1 text-sm text-stone-500">{formatPrice(item.pricePaise)} {homeContent.cart.unit}</p>
                    <p className="mt-2 font-semibold text-forest">{formatPrice(item.pricePaise * quantity)}</p>
                  </div>
                </div>
                {menuReady && !current && <p className="mt-3 text-sm text-stone-600">{homeContent.cart.hidden}</p>}
                {menuReady && current && !current.available && <p className="mt-3 text-sm text-stone-600">{homeContent.cart.unavailable}</p>}
                {current && current.pricePaise !== item.pricePaise && <p className="mt-3 text-sm text-stone-600">{homeContent.cart.priceChanged} {formatPrice(item.pricePaise)}. {homeContent.cart.currentPrice} {formatPrice(current.pricePaise)}.</p>}
                <div className="mt-4 flex items-center justify-between gap-3">
                  <div role="group" aria-label={`${homeContent.cart.quantity}, ${item.name}`} className="flex items-center rounded-full border border-stone-300">
                    <button
                      type="button"
                      disabled={quantity === 1}
                      onClick={() => onChangeQuantity(item.id, -1)}
                      aria-label={`${homeContent.cart.decrease} ${item.name}`}
                      className="size-11 rounded-full text-xl hover:bg-stone-100 disabled:cursor-not-allowed disabled:text-stone-300"
                    >−</button>
                    <output aria-label={`${item.name} ${homeContent.cart.quantity.toLowerCase()}`} className="min-w-8 text-center text-sm font-semibold">{quantity}</output>
                    <button type="button" disabled={!menuReady || !current?.available} onClick={() => onChangeQuantity(item.id, 1)} aria-label={`${homeContent.cart.increase} ${item.name}`} className="size-11 rounded-full text-xl hover:bg-stone-100 disabled:cursor-not-allowed disabled:text-stone-300">+</button>
                  </div>
                  <button type="button" onClick={() => setPendingRemoval(item.id)} aria-label={`${homeContent.cart.remove} ${item.name}`} className="min-h-11 rounded-md px-2 text-sm font-medium text-stone-600 underline underline-offset-4 hover:text-forest">{homeContent.cart.remove}</button>
                </div>
                {pendingRemoval === item.id && (
                  <div className="mt-4 rounded-2xl bg-stone-100 p-4">
                    <p className="text-sm font-medium">{homeContent.cart.confirmRemove}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" onClick={() => setPendingRemoval(null)} className="min-h-11 rounded-full border border-stone-300 bg-white px-4 text-sm">{homeContent.cart.keep}</button>
                      <button type="button" onClick={() => { onRemove(item.id); setPendingRemoval(null) }} className="min-h-11 rounded-full bg-forest px-4 text-sm font-medium text-white hover:bg-forest-dark">{homeContent.cart.removeConfirm}</button>
                    </div>
                  </div>
                )}
              </li>
            )})}
          </ul>
        )}
      </div>
      <div className="shrink-0 border-t border-stone-200 bg-white p-6">
        <div className="flex items-center justify-between gap-4 text-xl font-semibold">
          <p>{homeContent.cart.total}</p>
          <output aria-label={homeContent.cart.totalLabel} aria-live="polite">{formatPrice(totalPaise)}</output>
        </div>
        <p id="cart-demo-notice" className="mt-3 text-sm leading-relaxed text-stone-500">{homeContent.cart.demoNotice}</p>
      </div>
    </dialog>
  )
}
