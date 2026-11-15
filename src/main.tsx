import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted type pairing (SIL OFL 1.1): Space Grotesk for display, IBM Plex Sans for UI text and data. No monospace.
import '@fontsource-variable/space-grotesk/wght.css'
import '@fontsource-variable/ibm-plex-sans/wght.css'
import './index.css'
import App from './App.tsx'
import { installMotion } from './lib/motion'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

installMotion()
