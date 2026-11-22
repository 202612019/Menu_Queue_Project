import { useEffect, useRef, useState } from 'react'
import { checkOrderRequest, orderError, OrderError, placeOrder } from '../lib/orders'
import { clearPendingOrder, loadPendingOrder, savePendingOrder } from '../utils/pendingOrder'
import { orderContent as text } from '../content/orders'

/** @param {string|null} userId @param {(request: import('../utils/pendingOrder').PendingOrder, receipt: import('../lib/orders').Receipt) => void} onConfirmed */
export function useCheckout(userId, onConfirmed) {
  const user = useRef(userId); user.current = userId
  const confirmed = useRef(onConfirmed); confirmed.current = onConfirmed
  const [state,setState] = useState(/** @type {{userId: string|null, pending: import('../utils/pendingOrder').PendingOrder|null, busy: boolean, error: string, code: string, notice: string, storageError: boolean}} */ ({userId:null,pending:null,busy:false,error:'',code:'',notice:'',storageError:false}))
  const pendingRef = useRef(/** @type {import('../utils/pendingOrder').PendingOrder|null} */ (null))
  const working = useRef(/** @type {string|null} */ (null))
  const handled = useRef(new Set())
  const alive = useRef(true)
  useEffect(() => { alive.current=true; return () => { alive.current=false } },[])
  useEffect(() => {
    working.current=null
    let pending = null; let storageError=false
    try { pending = userId ? loadPendingOrder(userId) : null } catch { storageError=true }
    pendingRef.current=pending
    setState({userId,pending,busy:false,error:storageError?text.storage:'',code:'',notice:'',storageError})
  },[userId])

  /** @param {import('../utils/pendingOrder').PendingOrder} request @param {'place'|'check'} mode */
  async function run(request,mode) {
    if (working.current === request.userId || user.current !== request.userId) return
    working.current=request.userId
    setState(previous => ({...previous,busy:true,error:'',code:'',notice:''}))
    try {
      const receipt = mode==='check' ? await checkOrderRequest(request.requestId) : await placeOrder(request)
      if (!alive.current || user.current !== request.userId) return
      if (!receipt) {
        setState(previous => ({...previous,notice:text.notFoundYet}))
        return
      }
      const expected = JSON.stringify(request.items.slice().sort((a,b)=>a.menu_item_id.localeCompare(b.menu_item_id)))
      const actual = JSON.stringify(receipt.items.map(item=>({menu_item_id:item.menu_item_id,quantity:item.quantity})).sort((a,b)=>a.menu_item_id.localeCompare(b.menu_item_id)))
      if (expected!==actual) throw new OrderError('REQUEST_CONFLICT')
      try { clearPendingOrder(request.userId) } catch { /* A known success stays successful; replay is safe. */ }
      pendingRef.current=null
      setState(previous=>({...previous,pending:null,error:'',code:'',notice:''}))
      const identity=`${request.userId}:${request.requestId}`
      if (!handled.current.has(identity)) { handled.current.add(identity); confirmed.current(request,receipt) }
    } catch (cause) {
      if (!alive.current || user.current !== request.userId) return
      const error=orderError(cause)
      let storageError=false
      if (mode==='place' && error.definitive) {
        try { clearPendingOrder(request.userId); pendingRef.current=null }
        catch { storageError=true }
      }
      setState(previous=>({...previous,pending:pendingRef.current,error:storageError?text.storage:error.message,code:error.code,storageError}))
    } finally {
      if (working.current===request.userId) working.current=null
      if (alive.current && user.current===request.userId) setState(previous=>({...previous,busy:false}))
    }
  }

  /** @param {import('../lib/orders').Selection[]} items @param {string} fingerprint @param {string} cartId */
  function submit(items,fingerprint,cartId) {
    if (!userId || user.current!==userId || state.userId!==userId || state.storageError || working.current) return
    try {
      const existing=loadPendingOrder(userId)
      if (existing) { pendingRef.current=existing; setState(previous=>({...previous,pending:existing})); return }
      const request={userId,requestId:crypto.randomUUID(),items:structuredClone(items),fingerprint,cartId}
      savePendingOrder(request) // Persist BEFORE sending, including if the response is lost.
      pendingRef.current=request
      setState(previous=>({...previous,pending:request,error:'',code:''}))
      void run(request,'place')
    } catch { setState(previous=>({...previous,error:text.storage,storageError:true})) }
  }
  const matches=state.userId===userId
  return { pending:matches?state.pending:null,busy:matches&&state.busy,error:matches?state.error:'',code:matches?state.code:'',notice:matches?state.notice:'',
    restoring:!matches, blocked:!matches || state.storageError, submit,
    recover:() => { if (pendingRef.current) void run(pendingRef.current,'check') },
    retry:() => { if (pendingRef.current) void run(pendingRef.current,'place') } }
}
