import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import router from './routers/router.jsx'
import { installApiAuth } from './utils/apiAuth'
import "./styles/variables.css"

// Every backend request carries the login token from here on.
installApiAuth()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
)
