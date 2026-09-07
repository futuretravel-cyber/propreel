import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { ClerkProvider } from '@clerk/clerk-react'

// Import your Clerk Publishable Key from Vercel's environment variables
const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

// Safety check to ensure the key exists
if (!PUBLISHABLE_KEY) {
  console.error("Missing Clerk Publishable Key")
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={PUBLISHABLE_KEY || ""}>
      <App />
    </ClerkProvider>
  </React.StrictMode>
)
