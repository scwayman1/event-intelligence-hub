import { Outlet } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';
import { useState, useCallback } from 'react';
import { Menu } from 'lucide-react';

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  return (
    <div className="flex min-h-screen w-full bg-background overflow-x-hidden">
      {/* Mobile top bar - visible below lg */}
      <div className="fixed top-0 left-0 right-0 z-40 h-12 border-b border-sidebar-border bg-sidebar flex items-center px-4 lg:hidden">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 -ml-2 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
          aria-label="Open navigation"
        >
          <Menu className="w-5 h-5" />
        </button>
        <span className="ml-2 font-bold text-sidebar-accent-foreground tracking-tight text-sm">
          EventIQ
        </span>
      </div>

      {/* Backdrop overlay for mobile sidebar */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar: always visible on lg+, overlay on smaller screens */}
      <div
        className={`
          fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-300 ease-in-out
          lg:relative lg:translate-x-0 lg:transition-none
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <AppSidebar onNavigate={closeSidebar} />
      </div>

      <main className="flex-1 min-h-screen overflow-y-auto relative pt-12 lg:pt-0">
        {/* Subtle inset shadow from sidebar edge for depth */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-black/[0.04] to-transparent z-10 hidden lg:block" />
        <Outlet />
      </main>
    </div>
  );
}
