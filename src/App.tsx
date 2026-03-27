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
import NotFound from "./pages/NotFound";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useEventStore } from "@/data/store";

const queryClient = new QueryClient();

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

const App = () => (
  <ErrorBoundary>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/welcome" element={<RedirectIfOnboarded><Welcome /></RedirectIfOnboarded>} />
            <Route element={<RequireOnboarding><AppLayout /></RequireOnboarding>}>
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
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
    </ThemeProvider>
  </ErrorBoundary>
);

export default App;
