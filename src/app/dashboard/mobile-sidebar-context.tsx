"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type MobileSidebarContextValue = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
};

const MobileSidebarContext = createContext<MobileSidebarContextValue | null>(null);

// Shares open/closed state between the hamburger trigger (in Topbar) and the
// drawer itself (in Sidebar) — the two are siblings under DashboardLayout, so
// neither can hold this state on its own.
export function MobileSidebarProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const value: MobileSidebarContextValue = {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    toggle: () => setIsOpen((current) => !current),
  };

  return <MobileSidebarContext.Provider value={value}>{children}</MobileSidebarContext.Provider>;
}

export function useMobileSidebar() {
  const context = useContext(MobileSidebarContext);
  if (!context) {
    throw new Error("useMobileSidebar must be used within a MobileSidebarProvider");
  }
  return context;
}
