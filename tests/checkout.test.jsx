import { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, expect, it, vi } from 'vitest'
import { catalogue } from './fixtures/menu'

const fake=vi.hoisted(()=>({auth:{},preview:vi.fn(),place:vi.fn(),check:vi.fn(),read:vi.fn(),list:vi.fn()}))
vi.mock('../src/lib/supabase',()=>({supabase:null,supabaseConfigurationError:'Test only'}))
vi.mock('../src/auth/AuthProvider',()=>({useAuth:()=>fake.auth}))
vi.mock('../src/hooks/useMenu',async()=>{
  const {catalogue}=await import('./fixtures/menu')
  return {useMenu:()=>({data:catalogue,ready:true,loading:false,error:'',refresh:vi.fn()})}
})
vi.mock('../src/lib/orders',async()=>({...(await vi.importActual('../src/lib/orders')),previewOrder:fake.preview,placeOrder:fake.place,checkOrderRequest:fake.check,readOrder:fake.read,readOrders:fake.list}))
import { App } from '../src/app/App'
import { OrderError } from '../src/lib/orders'
import { orderContent as text } from '../src/content/orders'
import { loginDestination } from '../src/auth/returnTo'
import { authContent } from '../src/content/auth'

const uid='70000000-0000-4000-8000-000000000001'
const orderId='72000000-0000-4000-8000-000000000001'
const fixtureOrder={id:orderId,token:'20261122-041',status:'placed',customerName:'Student A',createdAt:'2026-11-22T04:00:00Z',totalPaise:4500,
  items:[{id:catalogue.items[0].id,name:'Original historical sandwich',quantity:1,pricePaise:4500,subtotalPaise:4500}],
  history:[{id:'history-1',new_status:'placed',changed_at:'2026-11-22T04:00:00Z',reason:null}]}
const student=()=>({user:{id:uid},profile:{id:uid,full_name:'Student A',email:'student@example.test',role:'student'},initializing:false,sessionError:'',profileLoading:false,profileError:'',recovery:false,logoutWarning:''})
const root=(path='/')=><StrictMode><MemoryRouter initialEntries={[path]}><App /></MemoryRouter></StrictMode>
const open=(path='/')=>render(root(path))
const add=name=>screen.getByRole('button',{name:`Add to cart, ${name}`})
async function checkout(user) {
  await user.click(add('Veg Sandwich'))
  await user.click(screen.getByRole('button',{name:'Open cart (1)'}))
  await user.click(screen.getByRole('link',{name:text.continue}))
  await screen.findByLabelText(text.reviewed)
}
async function place(user) {await user.click(screen.getByLabelText(text.reviewed));await user.click(screen.getByRole('button',{name:text.place,exact:true}))}

beforeEach(()=>{
  fake.auth=student()
  for(const method of ['preview','place','check','read','list']) fake[method].mockReset()
  fake.preview.mockImplementation(async items=>({fingerprint:'a'.repeat(64),totalPaise:items.reduce((sum,line)=>sum+catalogue.items.find(item=>item.id===line.menu_item_id).pricePaise*line.quantity,0),
    items:items.map(line=>({...line,name:catalogue.items.find(item=>item.id===line.menu_item_id).name,pricePaise:catalogue.items.find(item=>item.id===line.menu_item_id).pricePaise,subtotalPaise:catalogue.items.find(item=>item.id===line.menu_item_id).pricePaise*line.quantity}))}))
  fake.place.mockImplementation(async request=>({orderId,token:'20261122-041',status:'placed',totalPaise:4500,items:request.items}))
  fake.check.mockResolvedValue(null)
  fake.read.mockResolvedValue(fixtureOrder)
  fake.list.mockResolvedValue({active:[fixtureOrder],history:[]})
})

it('previews without auto-submitting, requires review, and clears only after confirmed success',async()=>{
  const user=userEvent.setup();open();await checkout(user)
  expect(fake.place).not.toHaveBeenCalled()
  expect(screen.getByRole('button',{name:text.place,exact:true})).toBeDisabled()
  expect(screen.getByLabelText(text.total)).toHaveTextContent('₹45')
  await place(user)
  await screen.findByText('20261122-041')
  expect(fake.place).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button',{name:'Open cart (0)'})).toBeInTheDocument()
  expect(screen.getByText(text.awaiting)).toBeInTheDocument()
  expect(sessionStorage.getItem(`college-canteen:checkout:${uid}`)).toBeNull()
})

it('preserves an uncertain request, blocks editing, and retries with the same ID after a negative lookup',async()=>{
  fake.place.mockRejectedValueOnce(new OrderError('NETWORK'))
  const user=userEvent.setup();open();await checkout(user);await place(user)
  await screen.findByText(text.pending)
  const first=structuredClone(fake.place.mock.calls[0][0])
  expect(JSON.parse(sessionStorage.getItem(`college-canteen:checkout:${uid}`)).requestId).toBe(first.requestId)
  await user.click(screen.getByRole('button',{name:'Open cart (1)'}))
  const cart=screen.getByRole('dialog')
  expect(within(cart).getByRole('button',{name:'Increase quantity of Veg Sandwich'})).toBeDisabled()
  expect(within(cart).getByRole('button',{name:'Remove Veg Sandwich',exact:true})).toBeDisabled()
  await user.click(within(cart).getByRole('button',{name:'Close cart'}))
  await user.click(screen.getByRole('button',{name:text.check}))
  await screen.findByText(text.notFoundYet)
  await user.click(screen.getByRole('button',{name:text.retrySame}))
  await screen.findByText('20261122-041')
  expect(fake.place.mock.calls[1][0]).toEqual(first)
})

it('restores pending request metadata after remount, never auto-submits, and recovers a committed receipt',async()=>{
  fake.place.mockRejectedValueOnce(new OrderError('NETWORK'))
  const user=userEvent.setup();const view=open();await checkout(user);await place(user)
  await screen.findByText(text.pending)
  const request=fake.place.mock.calls[0][0]
  view.unmount();open('/checkout')
  await screen.findByText(text.pending)
  expect(fake.place).toHaveBeenCalledTimes(1)
  fake.check.mockResolvedValue({orderId,token:'20261122-041',status:'placed',totalPaise:4500,items:request.items})
  await user.click(screen.getByRole('button',{name:text.check}))
  await screen.findByText('20261122-041')
  expect(fake.check).toHaveBeenCalledWith(request.requestId)
})

it('preserves the cart on changed-price rejection and requires review of the new preview',async()=>{
  fake.place.mockRejectedValueOnce(new OrderError('PRICE_CHANGED',true))
  const user=userEvent.setup();open();await checkout(user)
  fake.preview.mockResolvedValue({fingerprint:'b'.repeat(64),totalPaise:4750,items:[{menu_item_id:catalogue.items[0].id,name:'Veg Sandwich',quantity:1,pricePaise:4750,subtotalPaise:4750}]})
  await place(user)
  await screen.findByText(text.errors.PRICE_CHANGED)
  await waitFor(()=>expect(screen.getByLabelText(text.total)).toHaveTextContent('₹47.5'))
  expect(screen.getByRole('button',{name:text.place,exact:true})).toBeDisabled()
  expect(screen.getByRole('button',{name:'Open cart (1)'})).toBeInTheDocument()
  expect(sessionStorage.getItem(`college-canteen:checkout:${uid}`)).toBeNull()
  await place(user);await screen.findByText('20261122-041')
  expect(fake.place.mock.calls[1][0].fingerprint).toBe('b'.repeat(64))
})

it.each(['CANTEEN_CLOSED','ITEM_UNAVAILABLE','QUANTITY_LIMIT'])('shows %s without creating an order and permits a preview retry',async code=>{
  fake.preview.mockRejectedValue(new OrderError(code,true))
  const user=userEvent.setup();open();await user.click(add('Veg Sandwich'));await user.click(screen.getByRole('button',{name:'Open cart (1)'}));await user.click(screen.getByRole('link',{name:text.continue}))
  await screen.findByText(text.errors[code])
  expect(fake.place).not.toHaveBeenCalled()
  expect(screen.queryByRole('button',{name:text.place,exact:true})).not.toBeInTheDocument()
  expect(screen.getByRole('button',{name:'Open cart (1)'})).toBeInTheDocument()
})

it('prevents double submission while the first response is pending',async()=>{
  let finish
  fake.place.mockImplementation(request=>new Promise(resolve=>{finish=()=>resolve({orderId,token:'20261122-041',status:'placed',totalPaise:4500,items:request.items})}))
  const user=userEvent.setup();open();await checkout(user)
  await user.click(screen.getByLabelText(text.reviewed));await user.dblClick(screen.getByRole('button',{name:text.place,exact:true}))
  expect(fake.place).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button',{name:text.retrySame})).toBeDisabled()
  await act(async()=>finish());await screen.findByText('20261122-041')
})

it('enforces 20 per item and 50 total even during batched additions',()=>{
  open()
  act(()=>{
    for(let n=0;n<25;n++) fireEvent.click(add('Veg Sandwich'))
    for(let n=0;n<25;n++) fireEvent.click(add('Samosa'))
    for(let n=0;n<15;n++) fireEvent.click(add('Cold Coffee'))
  })
  expect(screen.getByRole('button',{name:'Open cart (50)'})).toBeInTheDocument()
  expect(add('Veg Sandwich')).toBeDisabled();expect(add('Cold Coffee')).toBeDisabled()
  fireEvent.click(screen.getByRole('button',{name:'Open cart (50)'}))
  const cart=screen.getByRole('dialog')
  expect(within(cart).getByLabelText('Veg Sandwich quantity')).toHaveTextContent('20')
  expect(within(cart).getByLabelText('Cold Coffee quantity')).toHaveTextContent('10')
  expect(within(cart).getByLabelText('Cart total')).toHaveTextContent('₹1,800')
})

it('returns a guest to checkout after sign-in restoration while preserving the mounted cart',async()=>{
  fake.auth={...student(),user:null,profile:null}
  const user=userEvent.setup();const view=open();const app=document.getElementById('home')
  await user.click(add('Veg Sandwich'));await user.click(screen.getByRole('button',{name:'Open cart (1)'}));await user.click(screen.getByRole('link',{name:text.continue}))
  await screen.findByRole('heading',{name:'Sign in',exact:true})
  fake.auth=student();view.rerender(root())
  await screen.findByRole('heading',{name:text.checkout,exact:true})
  expect(document.getElementById('home')).toBe(app)
  expect(screen.getByRole('button',{name:'Open cart (1)'})).toBeInTheDocument()
  expect(loginDestination({returnTo:'https://attacker.example'})).toBe('/account')
})

it('rejects wrong-role checkout and does not expose a different account’s pending request',async()=>{
  fake.auth={...student(),profile:{...student().profile,role:'staff'}}
  open('/checkout')
  await screen.findByRole('heading',{name:authContent.accessDenied})
  expect(fake.preview).not.toHaveBeenCalled()
})

it('ignores late creation results after an account switch and preserves the cart',async()=>{
  let finish
  fake.place.mockImplementation(request=>new Promise(resolve=>{finish=()=>resolve({orderId,token:'20261122-041',status:'placed',totalPaise:4500,items:request.items})}))
  const user=userEvent.setup();const view=open();await checkout(user);await place(user)
  fake.auth={...student(),user:{id:'70000000-0000-4000-8000-000000000002'},profile:{...student().profile,id:'70000000-0000-4000-8000-000000000002'}}
  view.rerender(root())
  await act(async()=>finish())
  expect(screen.queryByText('20261122-041')).not.toBeInTheDocument()
  expect(screen.getByRole('button',{name:'Open cart (1)'})).toBeInTheDocument()
  expect(sessionStorage.getItem(`college-canteen:checkout:${uid}`)).not.toBeNull()
})

it('shows own order history and historical snapshots without relying on menu names',async()=>{
  const user=userEvent.setup();open('/my-orders')
  await screen.findByRole('link',{name:/20261122-041/})
  expect(fake.list).toHaveBeenCalledWith(uid,0,expect.any(AbortSignal))
  await user.click(screen.getByRole('link',{name:/20261122-041/}))
  await screen.findByText('Original historical sandwich × 1')
  expect(fake.read).toHaveBeenCalledWith(uid,orderId,expect.any(AbortSignal))
  expect(screen.queryByRole('button',{name:/Cancel/})).not.toBeInTheDocument()
})

it('handles history read failure/retry, empty history and safe inaccessible order detail',async()=>{
  fake.list.mockRejectedValue(new Error('private server payload'))
  const user=userEvent.setup();const view=open('/my-orders')
  await screen.findByText(text.errors.READ)
  fake.list.mockResolvedValue({active:[],history:[]})
  await user.click(screen.getByRole('button',{name:text.refreshOrders}))
  await screen.findByText(text.historyEmpty)
  view.unmount();fake.read.mockRejectedValue(new OrderError('NOT_FOUND'));open(`/orders/${orderId}`)
  await screen.findByText(text.errors.NOT_FOUND)
  expect(screen.queryByText('private server payload')).not.toBeInTheDocument()
})

it('does not submit when pending-request storage is blocked',async()=>{
  const user=userEvent.setup();open();await checkout(user)
  const write=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('blocked')})
  try {
    await place(user);await screen.findByText(text.storage)
    expect(fake.place).not.toHaveBeenCalled()
    expect(screen.getByRole('button',{name:'Open cart (1)'})).toBeInTheDocument()
  }finally{write.mockRestore()}
})

it('paginates terminal history while keeping active orders visible',async()=>{
  const history=Array.from({length:20},(_,index)=>({...fixtureOrder,id:`history-${index}`,token:`old-${index}`,status:'collected'}))
  fake.list.mockResolvedValue({active:[fixtureOrder],history})
  const user=userEvent.setup();open('/my-orders')
  await screen.findByRole('link',{name:/old-19/})
  fake.list.mockResolvedValue({active:[fixtureOrder],history:[]})
  await user.click(screen.getByRole('button',{name:text.next}))
  await waitFor(()=>expect(fake.list).toHaveBeenLastCalledWith(uid,1,expect.any(AbortSignal)))
  expect(await screen.findByRole('link',{name:/20261122-041/})).toBeInTheDocument()
})

it('clears only submitted quantities and preserves units added later while signed out',async()=>{
  fake.place.mockRejectedValueOnce(new OrderError('NETWORK'))
  const user=userEvent.setup();const view=open();await checkout(user);await place(user)
  await screen.findByText(text.pending)
  const request=fake.place.mock.calls[0][0]
  fake.auth={...student(),user:null,profile:null};view.rerender(root())
  await screen.findByRole('heading',{name:'Sign in',exact:true})
  await user.click(screen.getByRole('link',{name:'Back to the homepage'}))
  await user.click(add('Veg Sandwich'))
  fake.auth=student();view.rerender(root())
  await user.click(screen.getByRole('button',{name:'Open cart (2)'}))
  await user.click(screen.getByRole('link',{name:text.continue}))
  await screen.findByText(text.pending)
  fake.check.mockResolvedValue({orderId,token:'20261122-041',status:'placed',totalPaise:4500,items:request.items})
  await user.click(screen.getByRole('button',{name:text.check}))
  await screen.findByText('20261122-041')
  expect(screen.getByRole('button',{name:'Open cart (1)'})).toBeInTheDocument()
})
