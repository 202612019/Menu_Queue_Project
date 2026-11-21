import { connectionTestContent } from '../content/connectionTest'
import { supabase, supabaseConfigurationError } from './supabase'

/** @typedef {{ id: string, name: string }} Category */
/** @typedef {{ id: string, name: string, category_id: string, price: number, is_available: boolean }} AvailableFood */
/** @typedef {{ categories: Category[], foodItems: AvailableFood[] }} ConnectionData */

/** @param {AbortSignal} signal @returns {Promise<ConnectionData>} */
export async function readMenuConnection(signal) {
  if (!supabase) throw new Error(supabaseConfigurationError)

  // Explicit columns and read-only queries keep this test limited to public menu data.
  const [categories, food] = await Promise.all([
    supabase.from('categories').select('id, name').order('name').abortSignal(signal),
    supabase.from('menu_items')
      .select('id, name, category_id, price, is_available')
      .eq('is_available', true)
      .order('name')
      .abortSignal(signal),
  ])

  if (categories.error) throw { ...categories.error, status: categories.status }
  if (food.error) throw { ...food.error, status: food.status }

  return { categories: categories.data ?? [], foodItems: food.data ?? [] }
}

/** @param {unknown} error */
export function getConnectionErrorMessage(error) {
  if (supabaseConfigurationError) return supabaseConfigurationError

  // Show helpful fixed messages, never raw errors, headers, or credentials.
  const code = error && typeof error === 'object' && 'code' in error ? error.code : ''
  const status = error && typeof error === 'object' && 'status' in error ? error.status : 0
  if (status === 403 || code === '42501') return connectionTestContent.errors.permissions
  if (status === 401 || code === 'PGRST301' || code === 'PGRST302' || code === 'PGRST303') {
    return connectionTestContent.errors.key
  }
  if (code === '42P01' || code === '42703' || code === 'PGRST204' || code === 'PGRST205') {
    return connectionTestContent.errors.schema
  }
  return connectionTestContent.errors.network
}
