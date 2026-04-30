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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
          <Link to="/" className="flex items-center gap-2 font-semibold text-foreground">
            <BarChart3 className="h-5 w-5 text-primary" />
            <span className="text-sm">ValueScope</span>
          </Link>

          <div className="flex-1 flex justify-center">
            <SearchBar />
          </div>

          <nav className="flex items-center gap-1">
            {navItems.map(({ path, label, icon: Icon }) => {
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

            {role === 'admin' && (
              <Link
                to="/admin/users"
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  location.pathname === '/admin/users'
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                <Users className="h-3.5 w-3.5" />
                Utilizadores
              </Link>
            )}

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
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto max-w-7xl px-4 py-6">
        {children}
      </main>
    </div>
  );
}
