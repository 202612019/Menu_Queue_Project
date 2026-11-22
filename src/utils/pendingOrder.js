/** @typedef {{userId: string, requestId: string, fingerprint: string, cartId: string, items: import('../lib/orders').Selection[]}} PendingOrder */
/** @param {string} userId */
const key = userId => `college-canteen:checkout:${userId}`
const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i
/** @param {string} userId @returns {PendingOrder|null} */
export function loadPendingOrder(userId) {
  const raw = sessionStorage.getItem(key(userId))
  if (!raw) return null
  const data = JSON.parse(raw)
  if (data.userId !== userId || !uuid.test(data.requestId) || !uuid.test(data.cartId) || !/^[a-f0-9]{64}$/.test(data.fingerprint)
    || !Array.isArray(data.items) || !data.items.length || data.items.length > 50
    || data.items.some((/** @type {import('../lib/orders').Selection} */ item) => !uuid.test(item.menu_item_id) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20)
    || data.items.reduce((/** @type {number} */ total, /** @type {import('../lib/orders').Selection} */ item) => total+item.quantity,0)>50
    || new Set(data.items.map((/** @type {import('../lib/orders').Selection} */ item) => item.menu_item_id)).size !== data.items.length) throw new Error('Invalid pending request')
  return data
}
/** @param {PendingOrder} request */
export function savePendingOrder(request) { sessionStorage.setItem(key(request.userId), JSON.stringify(request)) }
/** @param {string} userId */
export function clearPendingOrder(userId) { sessionStorage.removeItem(key(userId)) }
