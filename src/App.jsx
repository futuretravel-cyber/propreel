import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';

// Public pages
import PublicLayout from '@/components/marketing/PublicLayout';
import Home from '@/pages/Home';
import Pricing from '@/pages/Pricing';
import Reviews from '@/pages/Reviews';
import Contact from '@/pages/Contact';
import About from '@/pages/About';

// Auth pages
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';

// Authenticated pages
import StudioLayout from '@/components/studio/StudioLayout';
import Dashboard from '@/pages/Dashboard';
import Projects from '@/pages/Projects';
import NewProject from '@/pages/NewProject';
import ProjectDetail from '@/pages/ProjectDetail';
import QuickEdit from '@/pages/QuickEdit';
import Studio from '@/pages/Studio';
import BrandKits from '@/pages/BrandKits';
import Settings from '@/pages/Settings';
import Admin from '@/pages/Admin';
import Listings from '@/pages/Listings';
import NewListing from '@/pages/NewListing';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-purple-700 flex items-center justify-center">
            <span className="text-white font-bold text-sm">PR</span>
          </div>
          <div className="w-8 h-8 border-4 border-gray-200 border-t-purple-700 rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    }
  }

  return (
    <Routes>
      {/* Public marketing pages */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/reviews" element={<Reviews />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/about" element={<About />} />
      </Route>

      {/* Auth pages */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Authenticated studio pages */}
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<StudioLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/new" element={<NewProject />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/projects/:id/quick-edit" element={<QuickEdit />} />
          <Route path="/listings" element={<Listings />} />
          <Route path="/listings/new" element={<NewListing />} />
          <Route path="/brand-kits" element={<BrandKits />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/admin" element={<Admin />} />
        </Route>
        <Route path="/projects/:id/studio" element={<Studio />} />
      </Route>

      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App