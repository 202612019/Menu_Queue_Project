import { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, expect, it, vi } from 'vitest'
import { catalogue } from './fixtures/menu'
import { homeContent } from '../src/content/home'

const fake = vi.hoisted(() => ({ readMenu: vi.fn() }))
vi.mock('../src/lib/menu', () => ({ readMenu: fake.readMenu, menuErrorMessage: () => 'Menu connection failed. Please retry.' }))
vi.mock('../src/lib/supabase', () => ({ supabase: null, supabaseConfigurationError: 'Test only' }))
vi.mock('../src/auth/AuthProvider', () => ({ useAuth: () => ({ user: null, initializing: false, sessionError: '', logoutWarning: '' }) }))
import { App } from '../src/app/App'
import { MenuImage } from '../src/components/MenuImage'
import { useMenu } from '../src/hooks/useMenu'

beforeEach(() => { fake.readMenu.mockReset().mockResolvedValue(structuredClone(catalogue)) })
const open = () => render(<StrictMode><MemoryRouter><App /></MemoryRouter></StrictMode>)
const add = name => screen.getByRole('button', { name: `Add to cart, ${name}` })
const refresh = () => screen.getByRole('button', { name: 'Refresh menu' })
async function loaded() { await waitFor(() => expect(add('Veg Sandwich')).toBeEnabled()) }
async function openCart(user, count) { await user.click(screen.getByRole('button', { name: `Open cart (${count})` })); return screen.getByRole('dialog') }

it('loads all seeded dishes and filters all five categories, search and combined search', { timeout: 15000 }, async () => {
  const user = userEvent.setup()
  open(); await loaded()
  expect(screen.getAllByRole('article')).toHaveLength(8)
  expect(add('Veg Burger')).toBeDisabled()
  expect(within(screen.getByRole('article', { name: 'Veg Burger' })).getByText('Out of stock')).toBeInTheDocument()
  for (const [category, count] of [['Breakfast', 2], ['Snacks', 2], ['Meals', 1], ['Beverages', 2], ['Desserts', 1]]) {
    await user.click(screen.getByRole('button', { name: category, exact: true }))
    expect(screen.getAllByRole('article')).toHaveLength(count)
    for (const article of screen.getAllByRole('article')) expect(within(article).getByText(category)).toBeInTheDocument()
  }
  await user.click(screen.getByRole('button', { name: 'All', exact: true }))
  await user.type(screen.getByRole('searchbox'), '  COFFEE  ')
  expect(screen.getAllByRole('article')).toHaveLength(1)
  await user.click(screen.getByRole('button', { name: 'Breakfast', exact: true }))
  expect(screen.getByText(homeContent.menu.emptyTitle)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Clear filters' }))
  expect(screen.getAllByRole('article')).toHaveLength(8)
})

it('preserves cart quantities, totals and the mounted App across navigation; confirms removal', { timeout: 15000 }, async () => {
  const user = userEvent.setup()
  open(); await loaded()
  const app = document.getElementById('home')
  await user.click(add('Veg Sandwich')); await user.click(add('Veg Sandwich')); await user.click(add('Cold Coffee'))
  let cart = await openCart(user, 3)
  expect(within(cart).getByLabelText('Cart total')).toHaveTextContent('₹140')
  await user.click(within(cart).getByRole('button', { name: 'Increase quantity of Veg Sandwich' }))
  expect(within(cart).getByLabelText('Cart total')).toHaveTextContent('₹185')
  await user.click(within(cart).getByRole('button', { name: 'Decrease quantity of Veg Sandwich' }))
  await user.click(within(cart).getByRole('button', { name: 'Decrease quantity of Veg Sandwich' }))
  expect(within(cart).getByLabelText('Cart total')).toHaveTextContent('₹95')
  expect(within(cart).getByRole('button', { name: 'Decrease quantity of Veg Sandwich' })).toBeDisabled()
  await user.click(within(cart).getByRole('button', { name: 'Close cart' }))
  await user.click(screen.getAllByRole('link', { name: 'Sign in', exact: true })[0])
  await user.click(screen.getByRole('link', { name: 'Back to the homepage' }))
  await loaded()
  expect(document.getElementById('home')).toBe(app)
  cart = await openCart(user, 2)
  expect(within(cart).getByLabelText('Cart total')).toHaveTextContent('₹95')
  for (const name of ['Veg Sandwich', 'Cold Coffee']) {
    await user.click(within(cart).getByRole('button', { name: `Remove ${name}`, exact: true }))
    await user.click(within(cart).getByRole('button', { name: 'Remove item', exact: true }))
  }
  expect(within(cart).getByText('Your cart is empty')).toBeInTheDocument()
  expect(within(cart).getByLabelText('Cart total')).toHaveTextContent('₹0')
})

it('flags refreshed prices without repricing existing lines, including repeated additions', async () => {
  const user = userEvent.setup()
  open(); await loaded(); await user.click(add('Veg Sandwich'))
  const changed = structuredClone(catalogue)
  changed.items[0].pricePaise = 4750
  fake.readMenu.mockResolvedValue(changed)
  await user.click(refresh()); await loaded()
  await user.click(add('Veg Sandwich'))
  const cart = await openCart(user, 2)
  expect(within(cart).getByText(/Price changed.*₹45.*₹47\.5\./)).toBeInTheDocument()
  expect(within(cart).getByLabelText('Cart total')).toHaveTextContent('₹90')
})

it.each(['unavailable', 'hidden'])('blocks new additions and increases when the latest catalogue makes an item %s', async mode => {
  const user = userEvent.setup()
  open(); await loaded(); await user.click(add('Veg Sandwich')); await user.click(add('Veg Sandwich'))
  const changed = structuredClone(catalogue)
  if (mode === 'hidden') changed.items = changed.items.filter(item => item.name !== 'Veg Sandwich')
  else changed.items[0].available = false
  fake.readMenu.mockResolvedValue(changed)
  await user.click(refresh())
  await waitFor(() => expect(refresh()).toBeEnabled())
  if (mode === 'hidden') expect(screen.queryByRole('button', { name: 'Add to cart, Veg Sandwich' })).not.toBeInTheDocument()
  else expect(add('Veg Sandwich')).toBeDisabled()
  const cart = await openCart(user, 2)
  expect(within(cart).getByText(mode === 'hidden' ? homeContent.cart.hidden : homeContent.cart.unavailable)).toBeInTheDocument()
  expect(within(cart).getByRole('button', { name: 'Increase quantity of Veg Sandwich' })).toBeDisabled()
  await user.click(within(cart).getByRole('button', { name: 'Decrease quantity of Veg Sandwich' }))
  expect(within(cart).getByLabelText('Cart total')).toHaveTextContent('₹45')
})

it('keeps the cart and cached menu during refresh failure, blocks additions, then recovers with Retry', async () => {
  const user = userEvent.setup()
  open(); await loaded(); await user.click(add('Veg Sandwich'))
  fake.readMenu.mockRejectedValue(new Error('synthetic network failure'))
  await user.click(refresh())
  expect(await screen.findByRole('alert')).toHaveTextContent('Menu connection failed')
  expect(screen.getAllByRole('article')).toHaveLength(8)
  expect(add('Veg Sandwich')).toBeDisabled()
  const cart = await openCart(user, 1)
  expect(within(cart).getByLabelText('Cart total')).toHaveTextContent('₹45')
  expect(within(cart).getByRole('button', { name: 'Increase quantity of Veg Sandwich' })).toBeDisabled()
  await user.click(within(cart).getByRole('button', { name: 'Close cart' }))
  fake.readMenu.mockResolvedValue(catalogue)
  await user.click(screen.getByRole('button', { name: 'Retry', exact: true })); await loaded()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  await openCart(user, 1)
})

it('shows initial loading and error states and can retry without a full reload', async () => {
  let reject
  fake.readMenu.mockImplementation(() => new Promise((_resolve, fail) => { reject = fail }))
  const user = userEvent.setup()
  open()
  expect(screen.getByText(homeContent.menu.loading)).toBeInTheDocument()
  expect(screen.queryByRole('article')).not.toBeInTheDocument()
  await act(async () => reject(new Error('offline')))
  expect(screen.getByRole('alert')).toBeInTheDocument()
  fake.readMenu.mockResolvedValue(catalogue)
  await user.click(screen.getByRole('button', { name: 'Retry', exact: true })); await loaded()
})

it('distinguishes an empty catalogue from an empty category', async () => {
  fake.readMenu.mockResolvedValue({ categories: catalogue.categories, items: [] })
  const user = userEvent.setup()
  open()
  await screen.findByText(homeContent.menu.emptyCatalogue)
  fake.readMenu.mockResolvedValue({ ...catalogue, categories: [...catalogue.categories, { id: 'empty-category', name: 'Specials' }] })
  await user.click(refresh()); await loaded()
  await user.click(screen.getByRole('button', { name: 'Specials' }))
  expect(screen.getByText(homeContent.menu.emptyCategory)).toBeInTheDocument()
})

it('uses a neutral image fallback for missing/broken images and recovers when the URL changes', () => {
  const view = render(<MenuImage src="/broken.jpg" alt="Samosa" width={800} height={600} className="aspect-[4/3]" />)
  fireEvent.error(screen.getByRole('img'))
  expect(screen.getByRole('img', { name: 'Samosa: Image unavailable' })).toBeInTheDocument()
  view.rerender(<MenuImage src="https://cdn.example.test/new.jpg" alt="Samosa" width={800} height={600} className="aspect-[4/3]" />)
  expect(screen.getByRole('img')).toHaveAttribute('src', 'https://cdn.example.test/new.jpg')
  view.rerender(<MenuImage src="" alt="Samosa" width={80} height={80} className="size-20" />)
  expect(screen.getByText('Image unavailable')).toBeInTheDocument()
})

it('ignores stale requests after StrictMode replay and refresh; reloads on focus', async () => {
  const pending = []
  fake.readMenu.mockImplementation(signal => new Promise(resolve => pending.push({ signal, resolve })))
  function Probe() {
    const menu = useMenu(true)
    return <><button onClick={menu.refresh}>Refresh</button><output>{menu.data?.items[0]?.name ?? 'loading'}</output></>
  }
  render(<StrictMode><Probe /></StrictMode>)
  expect(pending).toHaveLength(2)
  expect(pending[0].signal.aborted).toBe(true)
  await act(async () => pending[1].resolve(catalogue))
  expect(screen.getByText('Veg Sandwich')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  await act(async () => pending[0].resolve({ ...catalogue, items: [] }))
  expect(screen.getByText('Veg Sandwich')).toBeInTheDocument()
  await act(async () => pending[2].resolve({ ...catalogue, items: [{ ...catalogue.items[0], name: 'New dish' }] }))
  expect(screen.getByText('New dish')).toBeInTheDocument()
  fireEvent(window, new Event('focus'))
  expect(pending).toHaveLength(4)
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  expect(pending[3].signal.aborted).toBe(true)
  await act(async () => pending[4].resolve(catalogue))
  await act(async () => pending[3].resolve({ ...catalogue, items: [] }))
  expect(screen.getByText('Veg Sandwich')).toBeInTheDocument()
})

it('times out a stalled request safely and retries without accepting its late result', async () => {
  vi.useFakeTimers()
  try {
    const pending = []
    fake.readMenu.mockImplementation(signal => new Promise(resolve => pending.push({ signal, resolve })))
    function Probe() {
      const menu = useMenu(true)
      return <><button onClick={menu.refresh}>Retry</button><p>{menu.error}</p><output>{menu.data?.items.length ?? 'not loaded'}</output></>
    }
    render(<Probe />)
    await act(async () => vi.advanceTimersByTime(15000))
    expect(pending[0].signal.aborted).toBe(true)
    expect(screen.getByText(homeContent.menu.loadError)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await act(async () => pending[1].resolve(catalogue))
    await act(async () => pending[0].resolve({ categories: [], items: [] }))
    expect(screen.getByText('8')).toBeInTheDocument()
  } finally { vi.useRealTimers() }
})
