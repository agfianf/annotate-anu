import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import AnnotationApp from './pages/AnnotationApp.tsx'
import LandingPage from './pages/LandingPage.tsx'
import ModelConfigPage from './pages/ModelConfigPage.tsx'

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/app" element={<AnnotationApp />} />
      <Route path="/models" element={<ModelConfigPage />} />
    </Routes>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
