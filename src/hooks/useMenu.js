import { useCallback, useEffect, useRef, useState } from 'react'
import { readMenu, menuErrorMessage } from '../lib/menu'
import { homeContent } from '../content/home'

/** @typedef {{data: import('../lib/menuModel').Catalogue|null, loading: boolean, error: string}} MenuState */

/** One catalogue owned by the mounted App, independent of authentication. @param {boolean} enabled */
export function useMenu(enabled) {
  const [state, setState] = useState(/** @type {MenuState} */ ({ data: null, loading: true, error: '' }))
  const active = useRef(/** @type {AbortController|null} */ (null))

  const refresh = useCallback(() => {
    active.current?.abort()
    const controller = new AbortController()
    active.current = controller
    setState(previous => ({ ...previous, loading: true, error: '' }))
    const timeout = window.setTimeout(() => {
      if (active.current !== controller || controller.signal.aborted) return
      controller.abort()
      setState(previous => ({ ...previous, loading: false, error: homeContent.menu.loadError }))
    }, 15000)
    controller.signal.addEventListener('abort', () => window.clearTimeout(timeout), { once: true })
    readMenu(controller.signal).then(data => {
      if (!controller.signal.aborted && active.current === controller) setState({ data, loading: false, error: '' })
    }).catch(error => {
      if (!controller.signal.aborted && active.current === controller) {
        setState(previous => ({ ...previous, loading: false, error: menuErrorMessage(error) }))
      }
    }).finally(() => window.clearTimeout(timeout))
  }, [])

  useEffect(() => () => { active.current?.abort(); active.current = null }, [])
  useEffect(() => {
    if (!enabled) return
    refresh()
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled, refresh])

  return { ...state, ready: Boolean(state.data && !state.loading && !state.error), refresh }
}
