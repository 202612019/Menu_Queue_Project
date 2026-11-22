import { supabase } from './supabase'
import { rupeesToPaise } from './menuModel'
import { orderContent as text } from '../content/orders'

/** @typedef {{menu_item_id: string, quantity: number}} Selection */
/** @typedef {{items: (Selection & {name: string, pricePaise: number, subtotalPaise: number})[], totalPaise: number, fingerprint: string}} OrderQuote */
/** @typedef {{orderId: string, token: string, status: string, totalPaise: number, items: Selection[]}} Receipt */
/** @typedef {{id: string, user_id: string, token: string, status: string, total_amount: number|string, customer_name?: string, created_at: string, order_items?: {menu_item_id: string, item_name_snapshot: string, unit_price_snapshot: number|string, quantity: number, subtotal: number|string}[], order_status_history?: {id: string, new_status: string, changed_at: string, reason: string|null}[]}} OrderRow */

export class OrderError extends Error {
  /** @param {string} code @param {boolean} [definitive] */
  constructor(code, definitive = false) {
    super(text.errors[/** @type {keyof typeof text.errors} */ (code)] || text.errors.NETWORK)
    this.code = code
    this.definitive = definitive
  }
}

/** Never display raw server messages. Only known transaction-rejection codes are definitive. @param {unknown} cause */
export function orderError(cause) {
  if (cause instanceof OrderError) return cause
  const value = /** @type {{code?: string, message?: string}} */ (cause || {})
  const known = ['AUTH_REQUIRED','STUDENT_REQUIRED','PROFILE_REQUIRED','INVALID_CART','QUANTITY_LIMIT','CANTEEN_CLOSED','ITEM_UNAVAILABLE','INVALID_TOTAL','INVALID_REQUEST','PRICE_CHANGED']
  if (value.code === 'P0001' && known.includes(value.message || '')) return new OrderError(value.message || '', true)
  if (value.code === 'P0001' && value.message === 'REQUEST_CONFLICT') return new OrderError('REQUEST_CONFLICT')
  if (value.code === 'PGRST202') return new OrderError('UNAVAILABLE', true)
  return new OrderError('NETWORK')
}

/** @param {import('../content/foodItems').CartItem[]} cart @returns {Selection[]} */
export function cartSelection(cart) {
  return cart.map(line => ({ menu_item_id: line.item.id, quantity: line.quantity })).sort((a,b) => a.menu_item_id.localeCompare(b.menu_item_id))
}

/** @param {string} name @param {Record<string,unknown>} args @param {AbortSignal} [signal] */
async function rpc(name, args, signal) {
  if (!supabase) throw new OrderError('UNAVAILABLE', true)
  const controller = new AbortController()
  const cancel = () => controller.abort()
  if (signal?.aborted) cancel()
  signal?.addEventListener('abort', cancel, { once: true })
  // Aborting HTTP is NOT proof that an order transaction rolled back.
  let timeout = /** @type {ReturnType<typeof setTimeout>|undefined} */ (undefined)
  const expired = /** @type {Promise<never>} */ (new Promise((_resolve,reject)=>{
    timeout=setTimeout(()=>{cancel();reject(new OrderError('NETWORK'))},15000)
  }))
  try {
    const { data, error } = await Promise.race([supabase.rpc(name, args).abortSignal(controller.signal),expired])
    if (error) throw orderError(error)
    return data
  } catch (error) { throw orderError(error) }
  finally { clearTimeout(timeout); signal?.removeEventListener('abort', cancel) }
}

/** @param {Selection[]} items @param {AbortSignal} signal @returns {Promise<OrderQuote>} */
export async function previewOrder(items, signal) {
  const data = await rpc('preview_online_order', { p_items: items }, signal)
  try {
    if (!data || !/^[a-f0-9]{64}$/.test(data.fingerprint) || !Array.isArray(data.items)) throw new Error()
    return { fingerprint: data.fingerprint, totalPaise: rupeesToPaise(data.total_amount), items: data.items.map(
      (/** @type {Selection & {name: string, unit_price: number|string, subtotal: number|string}} */ line) => ({
        menu_item_id: line.menu_item_id, quantity: line.quantity, name: line.name,
        pricePaise: rupeesToPaise(line.unit_price), subtotalPaise: rupeesToPaise(line.subtotal),
      })) }
  } catch { throw new OrderError('NETWORK') }
}

/** @param {any} data @returns {Receipt} */
function receipt(data) {
  try {
    if (!data?.order_id || !data.token || !Object.hasOwn(text.statuses,data.status) || !Array.isArray(data.items)) throw new Error()
    return { orderId: data.order_id, token: data.token, status: data.status, totalPaise: rupeesToPaise(data.total_amount), items: data.items }
  } catch { throw new OrderError('NETWORK') }
}
/** @param {{requestId: string, items: Selection[], fingerprint: string}} request */
export async function placeOrder(request) {
  return receipt(await rpc('place_online_order', { p_request_id: request.requestId, p_items: request.items, p_review_fingerprint: request.fingerprint }))
}
/** @param {string} requestId */
export async function checkOrderRequest(requestId) {
  const data = await rpc('check_online_order_request', { p_request_id: requestId })
  return data ? receipt(data) : null
}

/** @param {OrderRow} row @param {string} userId */
function mapOrder(row, userId) {
  if (row.user_id !== userId || !Object.hasOwn(text.statuses,row.status)) throw new OrderError('READ')
  return { id: row.id, token: row.token, status: row.status, customerName: row.customer_name ?? '', createdAt: row.created_at,
    totalPaise: rupeesToPaise(row.total_amount), items: (row.order_items ?? []).map(line => ({
      id: line.menu_item_id, name: line.item_name_snapshot, pricePaise: rupeesToPaise(line.unit_price_snapshot),
      quantity: line.quantity, subtotalPaise: rupeesToPaise(line.subtotal),
    })), history: (row.order_status_history ?? []).slice().sort((a,b) => a.changed_at.localeCompare(b.changed_at) || a.id.localeCompare(b.id)) }
}
/** @typedef {ReturnType<typeof mapOrder>} StudentOrder */
const summaryColumns = 'id, user_id, token, status, total_amount, created_at'
/** @param {string} userId @param {number} page @param {AbortSignal} signal */
export async function readOrders(userId, page, signal) {
  const client=supabase
  if (!client) throw new OrderError('READ')
  const base = () => client.from('orders').select(summaryColumns).eq('user_id',userId).order('created_at',{ascending:false}).order('id',{ascending:false})
  const [active, history] = await Promise.all([
    base().in('status',['placed','accepted','preparing','ready']).abortSignal(signal),
    base().in('status',['collected','cancelled','rejected']).range(page*20,page*20+19).abortSignal(signal),
  ])
  if (active.error || history.error) throw new OrderError('READ')
  return { active: (/** @type {OrderRow[]} */ (active.data ?? [])).map(row => mapOrder(row,userId)),
    history: (/** @type {OrderRow[]} */ (history.data ?? [])).map(row => mapOrder(row,userId)) }
}
/** @param {string} userId @param {string} orderId @param {AbortSignal} signal */
export async function readOrder(userId, orderId, signal) {
  if (!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(orderId)) throw new OrderError('NOT_FOUND')
  if (!supabase) throw new OrderError('READ')
  const {data,error} = await supabase.from('orders').select(`${summaryColumns}, customer_name, order_items(menu_item_id, item_name_snapshot, unit_price_snapshot, quantity, subtotal), order_status_history(id, new_status, changed_at, reason)`)
    .eq('user_id',userId).eq('id',orderId).abortSignal(signal).maybeSingle()
  if (error) throw new OrderError('READ')
  if (!data) throw new OrderError('NOT_FOUND')
  return mapOrder(/** @type {OrderRow} */ (data),userId)
}
