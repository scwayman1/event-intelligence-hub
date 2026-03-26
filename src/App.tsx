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

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<EventsHome />} />
            <Route path="/events/:eventId" element={<EventDashboard />} />
            <Route path="/events/:eventId/layout" element={<EventLayout />} />
            <Route path="/events/:eventId/guests" element={<EventGuests />} />
            <Route path="/events/:eventId/seating" element={<EventSeating />} />
            <Route path="/events/:eventId/versions" element={<EventVersions />} />
            <Route path="/events/:eventId/integrations" element={<EventIntegrations />} />
            <Route path="/events/:eventId/settings" element={<EventSettings />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
