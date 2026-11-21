import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { connectionTestContent as text } from '../content/connectionTest'
import { getConnectionErrorMessage, readMenuConnection } from '../lib/menuConnectionTest'
import { formatPrice } from '../utils/currency'

export default function SupabaseConnectionTest() {
  const [attempt, setAttempt] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState(/** @type {import('../lib/menuConnectionTest').ConnectionData | null} */ (null))

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    let timedOut = false
    setLoading(true)
    setError('')
    setData(null)

    const timeout = window.setTimeout(() => {
      timedOut = true
      controller.abort()
    }, 15000)

    readMenuConnection(controller.signal)
      .then((result) => {
        if (active) setData(result)
      })
      .catch((cause) => {
        if (active) setError(timedOut ? text.errors.timeout : getConnectionErrorMessage(cause))
      })
      .finally(() => {
        window.clearTimeout(timeout)
        if (active) setLoading(false)
      })

    // React StrictMode and navigation can cancel an obsolete attempt safely.
    return () => {
      active = false
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [attempt])

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-10 sm:px-8">
      <Link to="/" className="font-medium text-forest underline underline-offset-4">{text.home}</Link>
      <h1 className="mt-6 text-3xl font-bold">{text.title}</h1>
      <p className="mt-3 text-slate-600">{text.description}</p>

      <div className="mt-6" aria-busy={loading}>
        <p role="status" className="rounded-xl border border-slate-200 bg-white p-4">
          {loading ? text.loading : error ? text.failure : text.success}
        </p>
        {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{error}</p>}

        {data && (
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <section aria-labelledby="test-categories" className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 id="test-categories" className="text-xl font-semibold">{text.categories} ({data.categories.length})</h2>
              {data.categories.length === 0 ? <p className="mt-4">{text.noCategories}</p> : (
                <ul className="mt-4 space-y-2">
                  {data.categories.map((category) => <li key={category.id}>{category.name}</li>)}
                </ul>
              )}
            </section>

            <section aria-labelledby="test-food" className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 id="test-food" className="text-xl font-semibold">{text.availableFood} ({data.foodItems.length})</h2>
              {data.foodItems.length === 0 ? <p className="mt-4">{text.noFood}</p> : (
                <ul className="mt-4 space-y-4">
                  {data.foodItems.map((item) => (
                    <li key={item.id} className="border-b border-slate-100 pb-3 last:border-0">
                      <p className="font-semibold">{item.name} · {formatPrice(Math.round(Number(item.price) * 100))}</p>
                      <p className="mt-1 text-sm text-slate-600">
                        {text.category}: {data.categories.find((category) => category.id === item.category_id)?.name ?? text.unknownCategory}
                        {' · '}{text.available}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            {(data.categories.length === 0 || data.foodItems.length === 0) && <p className="sm:col-span-2">{text.emptyNotice}</p>}
          </div>
        )}
      </div>

      <button
        type="button"
        disabled={loading}
        onClick={() => setAttempt((previous) => previous + 1)}
        className="button-primary mt-6 disabled:cursor-wait disabled:opacity-60"
      >
        {text.retry}
      </button>
    </main>
  )
}
