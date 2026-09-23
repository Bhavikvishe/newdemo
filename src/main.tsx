import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { StoreProvider } from './lib/store'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
)