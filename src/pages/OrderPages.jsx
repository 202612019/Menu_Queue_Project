import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { AuthMessage } from '../components/AuthLayout'
import { orderContent as text } from '../content/orders'
import { cartSelection, orderError, previewOrder, readOrder, readOrders } from '../lib/orders'
import { formatPrice } from '../utils/currency'

/** @param {{title: string, children: import('react').ReactNode}} props */
function OrderLayout({title,children}) {
  return <main id="main-content" tabIndex={-1} className="page-container flex-1 py-10 sm:py-16">
    <section className="mx-auto max-w-3xl rounded-3xl border border-stone-200 bg-white p-6 sm:p-8">
      <h1 className="mb-6 text-3xl font-semibold tracking-tight">{title}</h1>
      {children}
      <Link to="/#menu" className="mt-7 inline-block min-h-11 text-sm text-forest underline">{text.browse}</Link>
    </section>
  </main>
}

/** @param {{items: import('../content/foodItems').CartItem[], cartId: string, checkout: ReturnType<typeof import('../hooks/useCheckout').useCheckout>}} props */
export function CheckoutPage({items,cartId,checkout}) {
  const auth=useAuth()
  const selection=cartSelection(items)
  const selectionKey=JSON.stringify(selection)
  const [attempt,setAttempt]=useState(0)
  const [reviewed,setReviewed]=useState(false)
  const [state,setState]=useState(/** @type {{key: string, quote: import('../lib/orders').OrderQuote|null, loading: boolean, error: string}} */ ({key:'',quote:null,loading:true,error:''}))
  const requestId=checkout.pending?.requestId
  useEffect(()=>{
    setReviewed(false)
    if (!items.length || requestId || checkout.restoring) return
    const controller=new AbortController()
    setState({key:selectionKey,quote:null,loading:true,error:''})
    previewOrder(JSON.parse(selectionKey),controller.signal).then(quote=>{
      if (!controller.signal.aborted) setState({key:selectionKey,quote,loading:false,error:''})
    }).catch(cause=>{
      if (!controller.signal.aborted) setState({key:selectionKey,quote:null,loading:false,error:orderError(cause).message})
    })
    return ()=>controller.abort()
  },[selectionKey,attempt,requestId,checkout.restoring,auth.user?.id,items.length])
  const quote=state.key===selectionKey?state.quote:null
  const changed=quote?.items.some(line=>items.find(saved=>saved.item.id===line.menu_item_id)?.item.pricePaise!==line.pricePaise)
  const savedTotal=items.reduce((total,line)=>total+line.item.pricePaise*line.quantity,0)
  return <OrderLayout title={text.checkout}>
    <p className="mb-4 text-sm text-stone-600">{text.payment}</p>
    <p className="mb-5 text-sm text-stone-500">{text.limits}</p>
    <dl className="mb-6 space-y-2 break-words text-sm">
      <div><dt className="font-semibold">{text.studentName}</dt><dd>{auth.profile?.full_name}</dd></div>
      <div><dt className="font-semibold">{text.email}</dt><dd>{auth.profile?.email}</dd></div>
    </dl>
    <AuthMessage error message={checkout.error} />
    <AuthMessage message={checkout.notice} />
    {checkout.pending ? <div className="mt-5 space-y-4">
      <AuthMessage message={text.pending} />
      <div className="flex flex-wrap gap-3">
        <button disabled={checkout.busy} onClick={checkout.recover} className="button-primary disabled:opacity-50">{checkout.busy?text.busy:text.check}</button>
        <button disabled={checkout.busy} onClick={checkout.retry} className="min-h-11 rounded-full border border-forest px-5 text-forest disabled:opacity-50">{text.retrySame}</button>
      </div>
    </div> : !items.length ? <AuthMessage message={text.empty} /> : <div className="space-y-5">
      {(state.loading || checkout.restoring || state.key!==selectionKey) && <AuthMessage message={text.loading} />}
      <AuthMessage error message={state.error} />
      {quote && <>
        {changed && <AuthMessage message={text.changed} />}
        <ul className="divide-y divide-stone-200">
          {quote.items.map(line=><li key={line.menu_item_id} className="flex flex-wrap justify-between gap-3 py-4">
            <span>{line.name} × {line.quantity}<span className="mt-1 block text-sm text-stone-500">{formatPrice(line.pricePaise)} {text.each}</span></span>
            <span className="font-semibold text-forest">{formatPrice(line.subtotalPaise)}</span>
          </li>)}
        </ul>
        {changed && <p className="text-sm text-stone-500">{text.saved}: {formatPrice(savedTotal)}</p>}
        <p className="flex justify-between text-xl font-semibold">{text.total}<output aria-label={text.total}>{formatPrice(quote.totalPaise)}</output></p>
        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-relaxed">
          <input type="checkbox" checked={reviewed} onChange={event=>setReviewed(event.target.checked)} className="mt-1 size-5 accent-forest" />{text.reviewed}
        </label>
        <p className="text-sm text-stone-500">{text.awaiting}</p>
        <button disabled={!reviewed || checkout.busy || checkout.blocked || state.loading}
          onClick={()=>{if(quote && reviewed) checkout.submit(selection,quote.fingerprint,cartId)}}
          className="button-primary w-full disabled:cursor-not-allowed disabled:opacity-50">{checkout.busy?text.busy:text.place}</button>
      </>}
      <button type="button" disabled={state.loading || checkout.restoring} onClick={()=>setAttempt(value=>value+1)} className="min-h-11 text-sm text-forest underline disabled:opacity-50">{text.refresh}</button>
    </div>}
    <Link to="/my-orders" className="mt-6 block min-h-11 text-sm text-forest underline">{text.myOrders}</Link>
  </OrderLayout>
}

/** @param {string} status */
const statusLabel=status=>text.statuses[/** @type {keyof typeof text.statuses} */(status)] || status
const dates=new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kolkata'})
/** @param {string} date */
const dateLabel=date=>Number.isFinite(Date.parse(date))?dates.format(new Date(date)):'—'

/** @param {{orders: import('../lib/orders').StudentOrder[]}} props */
function OrderList({orders}) {
  return <ul className="divide-y divide-stone-200">{orders.map(order=><li key={order.id} className="py-5">
    <Link to={`/orders/${order.id}`} className="flex flex-wrap justify-between gap-3 rounded-lg text-forest underline underline-offset-4">
      <span className="font-semibold">{order.token}</span><span>{statusLabel(order.status)}</span><span>{formatPrice(order.totalPaise)}</span>
    </Link><p className="mt-2 text-sm text-stone-500">{dateLabel(order.createdAt)}</p>
  </li>)}</ul>
}

export function MyOrdersPage() {
  const userId=useAuth().user?.id ?? ''
  const [page,setPage]=useState(0)
  const [attempt,setAttempt]=useState(0)
  const [state,setState]=useState(/** @type {{data: Awaited<ReturnType<typeof readOrders>>|null, loading: boolean, error: string}} */({data:null,loading:true,error:''}))
  useEffect(()=>{
    const controller=new AbortController()
    const timeout=setTimeout(()=>{controller.abort();setState({data:null,loading:false,error:text.errors.READ})},15000)
    setState({data:null,loading:true,error:''})
    readOrders(userId,page,controller.signal).then(data=>{if(!controller.signal.aborted)setState({data,loading:false,error:''})})
      .catch(()=>{if(!controller.signal.aborted)setState({data:null,loading:false,error:text.errors.READ})}).finally(()=>clearTimeout(timeout))
    return ()=>{clearTimeout(timeout);controller.abort()}
  },[userId,page,attempt])
  return <OrderLayout title={text.myOrders}>
    <button onClick={()=>setAttempt(value=>value+1)} disabled={state.loading} className="mb-5 min-h-11 text-forest underline disabled:opacity-50">{text.refreshOrders}</button>
    {state.loading && <AuthMessage message={text.loadingOrders} />}<AuthMessage error message={state.error} />
    {state.data && <>
      {!state.data.active.length && !state.data.history.length && page===0 && <AuthMessage message={text.historyEmpty} />}
      <h2 className="mt-4 text-xl font-semibold">{text.active}</h2><OrderList orders={state.data.active} />
      <h2 className="mt-6 text-xl font-semibold">{text.history}</h2><OrderList orders={state.data.history} />
    </>}
    <div className="mt-5 flex gap-5">
      <button disabled={page===0 || state.loading} onClick={()=>setPage(value=>value-1)} className="min-h-11 text-forest underline disabled:opacity-40">{text.previous}</button>
      <button disabled={state.loading || !state.data || state.data.history.length<20} onClick={()=>setPage(value=>value+1)} className="min-h-11 text-forest underline disabled:opacity-40">{text.next}</button>
    </div>
  </OrderLayout>
}

export function OrderDetailPage() {
  const userId=useAuth().user?.id ?? ''
  const {orderId=''}=useParams()
  const [attempt,setAttempt]=useState(0)
  const [state,setState]=useState(/** @type {{data: import('../lib/orders').StudentOrder|null, loading: boolean, error: string, id: string}} */({data:null,loading:true,error:'',id:orderId}))
  useEffect(()=>{
    const controller=new AbortController()
    const timeout=setTimeout(()=>{controller.abort();setState({data:null,loading:false,error:text.errors.READ,id:orderId})},15000)
    setState({data:null,loading:true,error:'',id:orderId})
    readOrder(userId,orderId,controller.signal).then(data=>{if(!controller.signal.aborted)setState({data,loading:false,error:'',id:orderId})})
      .catch(cause=>{if(!controller.signal.aborted)setState({data:null,loading:false,error:cause?.code==='NOT_FOUND'?text.errors.NOT_FOUND:text.errors.READ,id:orderId})}).finally(()=>clearTimeout(timeout))
    return ()=>{clearTimeout(timeout);controller.abort()}
  },[userId,orderId,attempt])
  const order=state.id===orderId?state.data:null
  return <OrderLayout title={text.details}>
    <button disabled={state.loading} onClick={()=>setAttempt(value=>value+1)} className="mb-5 min-h-11 text-forest underline disabled:opacity-50">{text.refreshOrders}</button>
    {state.loading && <AuthMessage message={text.loadingOrders} />}<AuthMessage error message={state.error} />
    {order && <>
      <p className="break-all text-3xl font-semibold text-forest">{order.token}</p>
      <p className="mt-3 text-xl">{statusLabel(order.status)}</p>
      <p className="mt-2 text-sm text-stone-500">{dateLabel(order.createdAt)}</p>
      <div className="mt-5"><AuthMessage message={order.status==='placed'?text.awaiting:order.status==='accepted'?text.accepted:order.status==='ready'?text.ready:''} /></div>
      <ul className="my-6 divide-y divide-stone-200">{order.items.map(item=><li key={item.id} className="flex flex-wrap justify-between gap-3 py-4">
        <span>{item.name} × {item.quantity}<span className="block text-sm text-stone-500">{formatPrice(item.pricePaise)} {text.each}</span></span><span>{formatPrice(item.subtotalPaise)}</span>
      </li>)}</ul>
      <p className="flex justify-between text-xl font-semibold">{text.total}<span>{formatPrice(order.totalPaise)}</span></p>
      <p className="mt-4 text-sm text-stone-600">{text.payment}</p>
      <h2 className="mt-7 text-xl font-semibold">{text.statusHistory}</h2>
      <ol className="mt-4 space-y-3">{order.history.map(event=><li key={event.id} className="text-sm">
        <span className="font-medium">{statusLabel(event.new_status)}</span> · {dateLabel(event.changed_at)}{event.reason && <p className="text-stone-500">{event.reason}</p>}
      </li>)}</ol>
    </>}
    <Link to="/my-orders" className="mt-6 block min-h-11 text-sm text-forest underline">{text.myOrders}</Link>
  </OrderLayout>
}
