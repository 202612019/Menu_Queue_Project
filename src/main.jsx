import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/dm-sans/latin-400.css'
import '@fontsource/dm-sans/latin-500.css'
import '@fontsource/dm-sans/latin-600.css'
import '@fontsource/dm-sans/latin-700.css'
import { App } from './app/App'
import './styles/index.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('The page is missing the React root element.')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
