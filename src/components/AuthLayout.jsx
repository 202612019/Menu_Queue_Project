import { Link } from 'react-router'
import { authContent as text } from '../content/auth'

/** @param {{ title: string, description?: string, children?: import('react').ReactNode }} props */
export function AuthLayout({ title, description, children }) {
  return (
    <main id="main-content" tabIndex={-1} className="page-container flex-1 py-10 sm:py-16">
      <section className="mx-auto max-w-md rounded-3xl border border-stone-200 bg-white p-6 sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-3 text-sm leading-relaxed text-stone-600">{description}</p>}
        <div className="mt-6">{children}</div>
        <Link to="/" className="mt-7 inline-block text-sm font-medium text-forest underline underline-offset-4">{text.home}</Link>
      </section>
    </main>
  )
}

/** @param {{ message: string, error?: boolean }} props */
export function AuthMessage({ message, error = false }) {
  if (!message) return null
  return <p role={error ? 'alert' : 'status'} className={`rounded-xl p-4 text-sm leading-relaxed ${error ? 'bg-red-50 text-red-800' : 'bg-stone-100 text-stone-700'}`}>{message}</p>
}

/** @param {{ id: string, label: string, type?: string, autoComplete?: string, hint?: string }} props */
export function AuthField({ id, label, type = 'text', autoComplete, hint }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">{label}</label>
      <input id={id} name={id} type={type} autoComplete={autoComplete} required maxLength={type === 'password' ? 256 : 254}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="mt-2 min-h-12 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base" />
      {hint && <p id={`${id}-hint`} className="mt-2 text-xs leading-relaxed text-stone-500">{hint}</p>}
    </div>
  )
}
