"use client";

import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";

// Makes a whole table row a click target while still letting any real
// <a>/<button> nested inside it (e.g. an "Edit" link) handle its own click
// instead of being hijacked by the row navigation.
export function ClickableRow({
  href,
  className = "",
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();

  function handleClick(event: MouseEvent<HTMLTableRowElement>) {
    if ((event.target as HTMLElement).closest("a, button")) {
      return;
    }
    router.push(href);
  }

  return (
    <tr onClick={handleClick} className={`cursor-pointer ${className}`}>
      {children}
    </tr>
  );
}
