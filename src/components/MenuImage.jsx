import { useState } from 'react'
import { resolveMenuImage } from '../utils/menuImage'
import { homeContent } from '../content/home'

/** @param {{src: string, alt: string, className: string, width: number, height: number}} props */
export function MenuImage({ src, alt, className, width, height }) {
  const resolved = resolveMenuImage(src)
  const [failed, setFailed] = useState('')
  return resolved && failed !== resolved ? (
    <img src={resolved} alt={alt} width={width} height={height} loading="lazy" className={className} onError={() => setFailed(resolved)} />
  ) : (
    <div role="img" aria-label={`${alt}: ${homeContent.menu.noImage}`} className={`flex items-center justify-center bg-stone-100 p-2 text-center text-xs text-stone-500 ${className}`}>
      {homeContent.menu.noImage}
    </div>
  )
}
