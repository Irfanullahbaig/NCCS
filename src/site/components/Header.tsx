"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { navigation } from "@/site/data/navigation";
import { site } from "@/site/data/site";
import { Logo } from "@/site/components/Logo";
import { MobileMenu } from "@/site/components/MobileMenu";

export function Header() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the menu after navigating (adjusting state during render, not in an effect).
  const [menuPath, setMenuPath] = useState(pathname);
  if (menuPath !== pathname) {
    setMenuPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    document.body.classList.toggle("nav-open", open);
    return () => document.body.classList.remove("nav-open");
  }, [open]);

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <>
    <div className="topbar">
      <div className="topbar-inner">
        <p className="topbar-place">{site.fullName} · {site.location}</p>
        <p>
          <Link href="/admissions">Admissions</Link>
          {" · "}
          <Link href="/contact">Contact</Link>
          {" · "}
          {/* Plain link: the staff dashboard has its own layout, so this is a full page load. */}
          <a href="/login?next=/students">Staff login</a>
        </p>
      </div>
    </div>
    <header className={`header${scrolled ? " is-scrolled" : ""}`}>
      <div className="header-inner">
        <Link href="/" className="brand-link" aria-label="NCCS home">
          <Logo priority />
        </Link>

        <nav className="nav-desktop" aria-label="Primary">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <Link className="header-apply" href="/admissions">
          Apply Now
        </Link>

        <button
          type="button"
          className={`menu-toggle${open ? " is-open" : ""}`}
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((value) => !value)}
        >
          <span />
          <span />
        </button>
      </div>
    </header>
    <MobileMenu open={open} onClose={() => setOpen(false)} />
    </>
  );
}
