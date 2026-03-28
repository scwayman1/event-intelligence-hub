import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/AppLayout";
import EventsHome from "@/pages/EventsHome";
import EventDashboard from "@/pages/EventDashboard";
import EventLayout from "@/pages/EventLayout";
import EventGuests from "@/pages/EventGuests";
import EventSeating from "@/pages/EventSeating";
import EventVersions from "@/pages/EventVersions";
import EventIntegrations from "@/pages/EventIntegrations";
import EventSettings from "@/pages/EventSettings";
import Welcome from "@/pages/Welcome";
import SignIn from "@/pages/SignIn";
import SignUp from "@/pages/SignUp";
import NotFound from "./pages/NotFound";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useEventStore } from "@/data/store";
import { AuthProvider, useAuthContext } from "@/contexts/AuthContext";

const queryClient = new QueryClient();

/** Must be signed in to access anything */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthContext();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }
  if (!user) return <Navigate to="/sign-in" replace />;
  return <>{children}</>;
}

/** Redirects to /welcome if the user hasn't completed onboarding */
function RequireOnboarding({ children }: { children: React.ReactNode }) {
  const hasCompletedOnboarding = useEventStore((s) => s.hasCompletedOnboarding);
  if (!hasCompletedOnboarding) return <Navigate to="/welcome" replace />;
  return <>{children}</>;
}

/** Redirects away from /welcome if onboarding is already done */
function RedirectIfOnboarded({ children }: { children: React.ReactNode }) {
  const hasCompletedOnboarding = useEventStore((s) => s.hasCompletedOnboarding);
  if (hasCompletedOnboarding) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** Redirects signed-in users away from auth pages */
function RedirectIfSignedIn({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthContext();
  const hasCompletedOnboarding = useEventStore((s) => s.hasCompletedOnboarding);
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }
  if (user) {
    return <Navigate to={hasCompletedOnboarding ? "/" : "/welcome"} replace />;
  }
  return <>{children}</>;
}

const AppRoutes = () => (
  <Routes>
    {/* Auth pages — accessible without signing in */}
    <Route path="/sign-in" element={<RedirectIfSignedIn><SignIn /></RedirectIfSignedIn>} />
    <Route path="/sign-up" element={<RedirectIfSignedIn><SignUp /></RedirectIfSignedIn>} />

    {/* Onboarding — requires auth but not onboarding complete */}
    <Route path="/welcome" element={<RequireAuth><RedirectIfOnboarded><Welcome /></RedirectIfOnboarded></RequireAuth>} />

    {/* App — requires auth + onboarding complete */}
    <Route element={<RequireAuth><RequireOnboarding><AppLayout /></RequireOnboarding></RequireAuth>}>
      <Route path="/" element={<ErrorBoundary><EventsHome /></ErrorBoundary>} />
      <Route path="/events/:eventId" element={<ErrorBoundary><EventDashboard /></ErrorBoundary>} />
      <Route path="/events/:eventId/layout" element={<ErrorBoundary><EventLayout /></ErrorBoundary>} />
      <Route path="/events/:eventId/guests" element={<ErrorBoundary><EventGuests /></ErrorBoundary>} />
      <Route path="/events/:eventId/seating" element={<ErrorBoundary><EventSeating /></ErrorBoundary>} />
      <Route path="/events/:eventId/versions" element={<ErrorBoundary><EventVersions /></ErrorBoundary>} />
      <Route path="/events/:eventId/integrations" element={<ErrorBoundary><EventIntegrations /></ErrorBoundary>} />
      <Route path="/events/:eventId/settings" element={<ErrorBoundary><EventSettings /></ErrorBoundary>} />
    </Route>
    <Route path="*" element={<NotFound />} />
  </Routes>
);

const App = () => (
  <ErrorBoundary>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
    </ThemeProvider>
  </ErrorBoundary>
);

export default App;
