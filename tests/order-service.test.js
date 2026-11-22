import { beforeEach, expect, it, vi } from 'vitest'
const fake=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn()}))
vi.mock('../src/lib/supabase',()=>({supabase:fake,supabaseConfigurationError:''}))
import {cartSelection,previewOrder,placeOrder,checkOrderRequest,readOrder,readOrders,orderError,OrderError} from '../src/lib/orders'
import {catalogue} from './fixtures/menu'
import {loadPendingOrder,savePendingOrder} from '../src/utils/pendingOrder'

const id=catalogue.items[0].id
const items=[{menu_item_id:id,quantity:3}]
const request={requestId:'71000000-0000-4000-8000-000000000001',items,fingerprint:'a'.repeat(64)}
beforeEach(()=>{fake.rpc.mockReset();fake.from.mockReset()})
const reply=data=>fake.rpc.mockReturnValue({abortSignal:()=>Promise.resolve({data,error:null})})

it('sends only IDs/quantities for preview and converts server decimals exactly once',async()=>{
  reply({fingerprint:'a'.repeat(64),total_amount:'0.87',items:[{...items[0],name:'Samosa',unit_price:'0.29',subtotal:'0.87'}]})
  const result=await previewOrder(items,new AbortController().signal)
  expect(result.totalPaise).toBe(87);expect(result.items[0].pricePaise).toBe(29)
  expect(fake.rpc).toHaveBeenCalledWith('preview_online_order',{p_items:items})
  expect(cartSelection([{item:catalogue.items[0],quantity:3}])).toEqual(items)
})
it('never sends cart prices, ownership, roles, status or totals during creation/recovery',async()=>{
  reply({order_id:'order-id',token:'20261122-001',status:'placed',total_amount:'0.87',items})
  await placeOrder(request)
  expect(fake.rpc).toHaveBeenLastCalledWith('place_online_order',{p_request_id:request.requestId,p_items:items,p_review_fingerprint:request.fingerprint})
  await checkOrderRequest(request.requestId)
  expect(fake.rpc).toHaveBeenLastCalledWith('check_online_order_request',{p_request_id:request.requestId})
})
it('maps known rejections but preserves uncertainty for network/conflict errors without exposing raw payloads',()=>{
  expect(orderError({code:'P0001',message:'PRICE_CHANGED'})).toMatchObject({code:'PRICE_CHANGED',definitive:true})
  expect(orderError({code:'P0001',message:'REQUEST_CONFLICT'}).definitive).toBe(false)
  expect(orderError({message:'private server headers'}).message).not.toContain('private')
  expect(orderError({code:'PGRST202'})).toMatchObject({code:'UNAVAILABLE',definitive:true})
})
it('times out a stalled creation as uncertain, even if transport ignores abort',async()=>{
  vi.useFakeTimers()
  try {
    fake.rpc.mockReturnValue({abortSignal:()=>new Promise(()=>{})})
    const result=placeOrder(request).catch(error=>error)
    await vi.advanceTimersByTimeAsync(15000)
    expect(await result).toMatchObject({code:'NETWORK',definitive:false})
  }finally{vi.useRealTimers()}
})
it('stores only user-bound pending selections and rejects corrupt/cross-user data',()=>{
  const pending={...request,userId:'student-a',cartId:crypto.randomUUID()}
  savePendingOrder(pending)
  expect(loadPendingOrder('student-a')).toEqual(pending)
  expect(loadPendingOrder('student-b')).toBeNull()
  sessionStorage.setItem('college-canteen:checkout:student-a',JSON.stringify({...pending,items:[{...items[0],quantity:21}]}))
  expect(()=>loadPendingOrder('student-a')).toThrow()
})
it('uses ownership filters for history/detail and renders stored snapshots without a catalogue join',async()=>{
  const queries=[]
  const row={id:'72000000-0000-4000-8000-000000000001',user_id:'student-a',token:'20261122-001',status:'collected',created_at:'2026-11-22T00:00:00Z',total_amount:'45.00',
    order_items:[{menu_item_id:id,item_name_snapshot:'Archived original name',unit_price_snapshot:'45.00',quantity:1,subtotal:'45.00'}]}
  fake.from.mockImplementation(table=>{
    const record={table,columns:'',filters:[],range:null};queries.push(record)
    const query={select:columns=>{record.columns=columns;return query},eq:(key,value)=>{record.filters.push([key,value]);return query},order:()=>query,in:()=>query,
      range:(start,end)=>{record.range=[start,end];return query},abortSignal:()=>query,
      then:resolve=>Promise.resolve({data:[row],error:null}).then(resolve),maybeSingle:()=>Promise.resolve({data:row,error:null})}
    return query
  })
  const result=await readOrder('student-a',row.id,new AbortController().signal)
  expect(result.items[0]).toMatchObject({name:'Archived original name',pricePaise:4500})
  expect(queries[0].filters).toEqual([['user_id','student-a'],['id',row.id]])
  expect(queries[0].columns).not.toContain('menu_items')
  await readOrders('student-a',1,new AbortController().signal)
  expect(queries.slice(1).every(query=>query.filters.some(([key,value])=>key==='user_id'&&value==='student-a'))).toBe(true)
  expect(queries[2].range).toEqual([20,39])
  await expect(readOrder('student-b',row.id,new AbortController().signal)).rejects.toBeInstanceOf(OrderError)
})
