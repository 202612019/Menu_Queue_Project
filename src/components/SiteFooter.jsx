import { homeContent } from '../content/home'

export function SiteFooter() {
  return (
    <footer className="mt-16 bg-forest text-white sm:mt-20">
      <div className="page-container grid gap-9 py-12 sm:grid-cols-2 lg:grid-cols-[1.3fr_0.7fr_1fr_1fr]">
        <div>
          <p className="text-xl font-semibold">{homeContent.title}</p>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-white/75">{homeContent.footer}</p>
        </div>
        <nav aria-label={homeContent.footerNavigation}>
          <h2 className="font-semibold">{homeContent.footerNavigation}</h2>
          <ul className="mt-3 space-y-1 text-sm text-white/80">
            {homeContent.navigation.map((link) => (
              <li key={link.href}><a className="inline-flex min-h-9 items-center rounded hover:text-white hover:underline" href={link.href}>{link.label}</a></li>
            ))}
          </ul>
        </nav>
        <div>
          <h2 className="font-semibold">{homeContent.hoursTitle}</h2>
          <ul className="mt-4 space-y-3 text-sm text-white/80">{homeContent.hours.map((line) => <li key={line}>{line}</li>)}</ul>
        </div>
        <div>
          <h2 className="font-semibold">{homeContent.contactTitle}</h2>
          <ul className="mt-4 space-y-3 text-sm text-white/80">{homeContent.contact.map((line) => <li key={line}>{line}</li>)}</ul>
        </div>
      </div>
      <div className="page-container border-t border-white/20 py-6 text-sm text-white/65">
        © {new Date().getFullYear()} {homeContent.title}. {homeContent.copyright}
      </div>
    </footer>
  )
}
