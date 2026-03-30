import { Outlet, useLocation } from 'react-router-dom';
import { useState, useMemo } from 'react';
import { AppSidebar } from './AppSidebar';
import { FranckChat } from './orchestrator/FranckChat';

/** Extract eventId from /events/:eventId/... paths */
function useEventIdFromPath(): string | null {
  const { pathname } = useLocation();
  const match = pathname.match(/^\/events\/([^/]+)/);
  return match ? match[1] : null;
}

export function AppLayout() {
  const [showInspector, setShowInspector] = useState(true);
  const eventId = useEventIdFromPath();

  return (
    <div className="flex min-h-screen w-full bg-background">
      <AppSidebar
        showInspector={showInspector}
        onToggleInspector={() => setShowInspector(!showInspector)}
      />
      <main className="flex-1 min-h-screen overflow-y-auto">
        <Outlet context={{ showInspector, setShowInspector }} />
      </main>
      {/* Franck persists across all event pages — chat state preserved as you navigate */}
      {eventId && <FranckChat eventId={eventId} />}
    </div>
  );
}
