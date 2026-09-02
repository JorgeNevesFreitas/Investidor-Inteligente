import { Link, useLocation } from "react-router-dom";
import { BarChart3, Briefcase, Star, LayoutDashboard, LogOut, Users } from "lucide-react";
import { SearchBar } from "./SearchBar";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

const navItems = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/portfolio", label: "Portfolio", icon: Briefcase },
  { path: "/wishlist", label: "Wishlist", icon: Star },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { role, signOut } = useAuth();

  const allNavItems = [
    ...navItems,
    ...(role === 'admin' ? [{ path: '/admin/users', label: 'Utilizadores', icon: Users }] : []),
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          <Link to="/" className="flex items-center gap-2 font-semibold text-foreground shrink-0">
            <BarChart3 className="h-5 w-5 text-primary" />
            <span className="hidden sm:inline text-sm">ValueScope</span>
          </Link>

          <div className="flex-1">
            <SearchBar />
          </div>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {allNavItems.map(({ path, label, icon: Icon }) => {
              const active = location.pathname === path;
              return (
                <Link
                  key={path}
                  to={path}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </Link>
              );
            })}

            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 ml-1 text-muted-foreground hover:text-foreground"
              onClick={signOut}
              title="Terminar sessão"
            >
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </nav>

          {/* Mobile logout button */}
          <Button
            variant="ghost"
            size="sm"
            className="md:hidden h-9 w-9 p-0 text-muted-foreground hover:text-foreground"
            onClick={signOut}
            title="Terminar sessão"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Main — extra bottom padding on mobile to clear bottom nav */}
      <main className="mx-auto max-w-7xl px-4 py-6 pb-20 md:pb-6">
        {children}
      </main>

      {/* Mobile bottom navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur-md">
        <div className="flex items-center justify-around h-14">
          {allNavItems.map(({ path, label, icon: Icon }) => {
            const active = location.pathname === path;
            return (
              <Link
                key={path}
                to={path}
                className={`flex flex-col items-center gap-0.5 px-3 py-2 min-w-[56px] text-[10px] font-medium transition-colors ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <Icon className="h-5 w-5" />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
