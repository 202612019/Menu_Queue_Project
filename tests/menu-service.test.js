import { beforeEach, describe, expect, it, vi } from 'vitest'
import { categoryRows, itemRows } from './fixtures/menu'
import { mapMenu, rupeesToPaise } from '../src/lib/menuModel'
import { resolveMenuImage } from '../src/utils/menuImage'

const fake = vi.hoisted(() => ({ from: vi.fn(), categories: null, items: null, queries: [] }))
vi.mock('../src/lib/supabase', () => ({ supabase: { from: fake.from }, supabaseConfigurationError: '' }))
import { readMenu, menuErrorMessage } from '../src/lib/menu'

beforeEach(() => {
  fake.categories = { data: categoryRows, error: null }
  fake.items = { data: itemRows, error: null }
  fake.queries = []
  fake.from.mockImplementation(table => {
    const record = { table, select: '', filters: [], signal: null }
    fake.queries.push(record)
    const query = {
      select: columns => { record.select = columns; return query },
      eq: (column, value) => { record.filters.push([column, value]); return query },
      order: () => query,
      abortSignal: signal => { record.signal = signal; return Promise.resolve(table === 'categories' ? fake.categories : fake.items) },
    }
    return query
  })
})

describe('public menu data boundary', () => {
  it('reads all five categories/eight foods using the existing client, including unavailable burger', async () => {
    const signal = new AbortController().signal
    const result = await readMenu(signal)
    expect(result.categories).toHaveLength(5)
    expect(result.items).toHaveLength(8)
    expect(result.items.find(item => item.name === 'Veg Burger')).toMatchObject({ available: false, pricePaise: 6500 })
    expect(result.items.map(item => item.pricePaise)).toEqual([4500, 6000, 6500, 2000, 9000, 5000, 3500, 3000])
    expect(fake.queries[0].filters).toEqual([['is_active', true]])
    expect(fake.queries[1].filters).toEqual([])
    expect(fake.queries.every(query => query.signal === signal)).toBe(true)
    expect(fake.queries[1].select).toBe('id, name, description, category_id, price, image_url, is_available')
  })
  it('hides archived categories and their items even if elevated RLS returns them', () => {
    const data = mapMenu(categoryRows.map((row, index) => ({ ...row, is_active: index !== 0 })), itemRows)
    expect(data.categories).toHaveLength(4)
    expect(data.items).toHaveLength(6)
    expect(data.items.some(item => item.category === 'Breakfast')).toBe(false)
  })
  it.each([[45, 4500], ['47.50', 4750], [0.29, 29], ['0.01', 1], ['0', 0], ['9999999999.99', 999999999999]])('converts %s rupees once into %s integer paise', (input, expected) => {
    expect(rupeesToPaise(input)).toBe(expected)
  })
  it.each(['NaN', Infinity, -1, '1.234', null, '', '9007199254740991.00'])('rejects invalid/unsafe price %s without fabricating a price', price => {
    expect(() => rupeesToPaise(price)).toThrow(RangeError)
  })
  it('rejects a partial/error result with safe fixed messaging', async () => {
    fake.items = { data: null, error: { message: 'sensitive raw server details' } }
    await expect(readMenu(new AbortController().signal)).rejects.not.toThrow('sensitive raw server details')
    expect(menuErrorMessage({ message: 'sensitive raw server details' })).not.toContain('sensitive')
  })
  it('resolves web, root-relative and app-relative images without double slashes or route prefixes', () => {
    expect(resolveMenuImage('https://cdn.example.test/food.jpg', '/canteen/')).toBe('https://cdn.example.test/food.jpg')
    expect(resolveMenuImage('/images/menu/samosa.jpg', '/canteen/')).toBe('/images/menu/samosa.jpg')
    expect(resolveMenuImage('images/menu/samosa.jpg', '/canteen/')).toBe('/canteen/images/menu/samosa.jpg')
    expect(resolveMenuImage('./images/menu/samosa.jpg', '/')).toBe('/images/menu/samosa.jpg')
    for (const value of [null, '', 'javascript:alert(1)', '//unknown.test/a.jpg', 'data:text/html,abc']) expect(resolveMenuImage(value)).toBe('')
  })
})
