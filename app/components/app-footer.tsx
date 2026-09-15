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
    <footer className="border-t border-zinc-800 bg-zinc-950 text-zinc-300">
      <div className="mx-auto max-w-screen-2xl px-4 py-7 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-5 border-b border-zinc-800 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <Link to="/" className="flex items-center gap-2 text-zinc-100">
            <Workflow className="size-4 text-cyan-400" />
            <span className="text-sm font-medium">PBI Lineage Explorer</span>
          </Link>
          <nav aria-label="Footer navigation" className="flex flex-wrap gap-x-5 gap-y-3 text-xs">
            {footerLinks.map((item) => (
              <Link key={item.to} to={item.to} className="transition-colors hover:text-white">
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex flex-col gap-2 pt-5 text-xs text-zinc-400 sm:flex-row sm:items-center sm:justify-between">
          <span>
            Developed by <strong className="font-semibold text-white">Satyadeep Singh</strong>
          </span>
          <span>Copyright &copy; {new Date().getFullYear()} PBI Lineage Explorer. All rights reserved.</span>
        </div>
      </div>
    </footer>
  );
}
