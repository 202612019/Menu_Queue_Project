import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// Session restoration/routing can exceed the default one-second wait under load.
// Keep assertions intact and use a bounded wait below the app's network timeout.
configure({ asyncUtilTimeout: 3000 })

afterEach(() => { cleanup(); sessionStorage.clear(); localStorage.clear() })
window.scrollTo = vi.fn()
Element.prototype.scrollIntoView = vi.fn()
HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new Event('close')) }
