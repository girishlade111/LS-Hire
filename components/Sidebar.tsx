"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavLink = {
  href: string;
  label: string;
};

const links: NavLink[] = [
  { href: "/dashboard", label: "Applications" },
  { href: "/dashboard/settings", label: "Settings" },
  { href: "/dashboard/reply-method", label: "Reply method" }
];

export function Sidebar() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname.startsWith(href);

  return (
    <aside className="w-[260px] h-screen sticky top-0 border-r border-border bg-base flex flex-col">
      <div className="px-5 py-5 border-b border-border">
        <div className="text-h1 text-text">Hire</div>
        <div className="text-eyebrow text-text-faint">by Lade Stack</div>
      </div>
      <nav aria-label="Dashboard navigation" className="flex-1 px-2 py-3">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`block px-3 py-2 rounded-control text-label transition-colors duration-150 ${
              isActive(link.href)
                ? "bg-panel-2 text-text"
                : "text-text-muted hover:text-text hover:bg-panel-2"
            }`}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <div className="px-5 py-4 border-t border-border">
        <span className="text-eyebrow text-text-faint">hire.ladestack.in</span>
      </div>
    </aside>
  );
}
