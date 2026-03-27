import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
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
import NotFound from "./pages/NotFound";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const queryClient = new QueryClient();

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route element={<AppLayout />}>
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
  </ErrorBoundary>
);

export default App;
