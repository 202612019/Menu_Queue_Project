import { supabase, supabaseConfigurationError } from './supabase'
import { mapMenu } from './menuModel'
import { homeContent } from '../content/home'

/** @param {AbortSignal} signal @returns {Promise<import('./menuModel').Catalogue>} */
export async function readMenu(signal) {
  if (!supabase) throw new Error(supabaseConfigurationError)
  const [categories, items] = await Promise.all([
    supabase.from('categories').select('id, name, is_active').eq('is_active', true).order('name').abortSignal(signal),
    supabase.from('menu_items').select('id, name, description, category_id, price, image_url, is_available').order('name').abortSignal(signal),
  ])
  if (categories.error || items.error) throw new Error(homeContent.menu.loadError)
  if (!categories.data || !items.data) throw new Error(homeContent.menu.loadError)
  // Explicit membership filtering also hides archived categories from an admin's public menu.
  return mapMenu(categories.data, items.data)
}

/** @param {unknown} error */
export function menuErrorMessage(error) {
  if (supabaseConfigurationError) return supabaseConfigurationError
  return error instanceof RangeError ? homeContent.menu.invalidData : homeContent.menu.loadError
}
