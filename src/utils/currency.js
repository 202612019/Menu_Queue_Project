const rupeeFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

/** @param {number} paise */
export function formatPrice(paise) {
  return rupeeFormatter.format(paise / 100)
}
