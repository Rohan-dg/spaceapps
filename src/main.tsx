import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import Intro from './components/Intro'
import { installMotion } from './lib/motion'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Intro />
  </StrictMode>,
)

installMotion()
