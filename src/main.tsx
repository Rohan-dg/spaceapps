import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted type (all SIL OFL 1.1): Chakra Petch for headings and HUD labels, Geist for UI text, Geist Mono for data.
// Latin subsets only for the static Chakra Petch weights; the variable faces carry unicode-range so browsers fetch latin only.
import '@fontsource/chakra-petch/latin-500.css'
import '@fontsource/chakra-petch/latin-600.css'
import '@fontsource/chakra-petch/latin-700.css'
import '@fontsource-variable/geist/wght.css'
import '@fontsource-variable/geist-mono/wght.css'
import './index.css'
import App from './App.tsx'
import { installMotion } from './lib/motion'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

installMotion()
