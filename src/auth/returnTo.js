/** Only the checkout return route is accepted; never redirect to arbitrary input. @param {unknown} state */
export function loginDestination(state) {
  return state && typeof state==='object' && 'returnTo' in state && state.returnTo==='/checkout' ? '/checkout' : '/account'
}
