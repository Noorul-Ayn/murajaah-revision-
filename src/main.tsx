import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/amiri-quran/400.css'
import '@fontsource-variable/readex-pro/index.css'
import './styles/global.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
