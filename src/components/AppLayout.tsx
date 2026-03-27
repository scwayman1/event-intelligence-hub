import { Outlet } from 'react-router-dom';
import { useState } from 'react';
import { AppSidebar } from './AppSidebar';

export function AppLayout() {
  const [showInspector, setShowInspector] = useState(true);

  return (
    <div className="flex min-h-screen w-full bg-background">
      <AppSidebar
        showInspector={showInspector}
        onToggleInspector={() => setShowInspector(!showInspector)}
      />
      <main className="flex-1 min-h-screen overflow-y-auto">
        <Outlet context={{ showInspector, setShowInspector }} />
      </main>
    </div>
  );
}
