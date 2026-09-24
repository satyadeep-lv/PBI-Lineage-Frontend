import { Workflow } from "lucide-react";
import { Link } from "react-router";

const footerLinks = [
  { label: "Home", to: "/" },
  { label: "Setup guide", to: "/setup-guide" },
  { label: "Workspace", to: "/workspace/power-bi" },
  { label: "API reference", to: "/workspace/api-docs" },
];

export function AppFooter() {
  return (
    <footer className="border-t border-border bg-surface text-muted-foreground">
      <div className="mx-auto max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-center sm:justify-between">
          <Link to="/" className="flex items-center gap-2 text-foreground">
            <Workflow className="size-4 text-fabric" />
            <span className="text-sm font-medium">PBI Lineage Explorer</span>
          </Link>
          <nav aria-label="Footer navigation" className="flex flex-wrap gap-x-5 gap-y-3 text-xs">
            {footerLinks.map((item) => (
              <Link key={item.to} to={item.to} className="transition-colors hover:text-foreground">
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex flex-col gap-2 pt-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>
            Developed by <strong className="font-semibold text-foreground">Satyadeep Singh</strong>
          </span>
          <span>Copyright &copy; {new Date().getFullYear()} PBI Lineage Explorer. All rights reserved.</span>
        </div>
      </div>
    </footer>
  );
}
