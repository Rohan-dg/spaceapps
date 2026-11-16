import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/tahoe.css'
import App from './App.tsx'
import Intro from './components/Intro'
import { installMotion } from './lib/motion'
import { installPointerGlow } from './lib/pointerGlow'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Intro />
  </StrictMode>,
)

installMotion()
installPointerGlow()

// SI disclosure (NASA Space Apps): written with SI assistance by Claude Opus 5.5 (Anthropic, 8 commits), under the team's direction. Attribution from the commit history.
