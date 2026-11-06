"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { navigation } from "@/site/data/navigation";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function MobileMenu({ open, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="mobile-menu" id="mobile-menu" role="dialog" aria-modal="true" aria-label="Navigation">
      <div className="mobile-menu-bar">
        <p>Menu</p>
        <button ref={closeRef} type="button" className="text-btn" onClick={onClose}>
          Close
        </button>
      </div>
      <nav>
        {navigation.map((item) => (
          <Link key={item.href} href={item.href} onClick={onClose}>
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
