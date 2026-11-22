/** @param {string|null|undefined} image @param {string} [base] */
export function resolveMenuImage(image, base = import.meta.env.BASE_URL) {
  const value = image?.trim()
  if (!value) return ''
  // Allow web images only; other schemes are not catalogue image sources.
  if (/^https?:\/\//i.test(value)) return value
  if (/^[a-z][a-z\d+.-]*:/i.test(value) || value.startsWith('//') || value.includes('\\')) return ''
  if (value.startsWith('/')) return value
  return `${base.replace(/\/$/, '')}/${value.replace(/^\.\//, '')}`
}
