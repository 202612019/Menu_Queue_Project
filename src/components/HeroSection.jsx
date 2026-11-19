import { homeContent } from '../content/home'

export function HeroSection() {
  return (
    <section aria-labelledby="welcome-title" className="grid items-center gap-10 py-10 sm:py-14 lg:grid-cols-[1.12fr_1fr] lg:gap-14 lg:py-16">
      <div>
        <h1 id="welcome-title" className="max-w-2xl text-5xl font-semibold leading-[1.08] tracking-[-0.045em] sm:text-6xl lg:text-[4.4rem]">
          {homeContent.heading}
        </h1>
        <p className="mt-6 max-w-md text-lg leading-relaxed text-stone-600">{homeContent.description}</p>
        <a href="#menu" className="button-primary mt-8 inline-flex">{homeContent.action}</a>
      </div>
      <figure>
        <img
          src={`${import.meta.env.BASE_URL}images/canteen-thali-preview.jpg`}
          alt={homeContent.imageAlt}
          width="1000"
          height="1000"
          fetchPriority="high"
          className="aspect-[5/4] w-full rounded-[2rem] bg-stone-200 object-cover lg:aspect-square"
        />
        <figcaption className="mt-2 text-right text-xs text-stone-500">{homeContent.imageCaption}</figcaption>
      </figure>
    </section>
  )
}
