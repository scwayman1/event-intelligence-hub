import { Outlet } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';

export function AppLayout() {
  return (
    <div className="flex min-h-screen w-full bg-background">
      <AppSidebar />
      <main className="flex-1 min-h-screen overflow-y-auto relative">
        {/* Subtle inset shadow from sidebar edge for depth */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-black/[0.04] to-transparent z-10" />
        <Outlet />
      </main>
    </div>
  );
}
