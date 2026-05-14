"use client";

import * as React from "react";
import Link from "next/link";
import {
  FileText,
  LogOut,
  MessageSquare,
  Moon,
  Settings,
  Shield,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { signOut } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { cn } from "@/lib/utils";

interface ProfileMenuUser {
  uid: string;
  email: string | null;
  name: string | null;
  picture: string | null;
}

interface ProfileMenuProps {
  user: ProfileMenuUser;
  children?: React.ReactNode;
}

export const MenuContext = React.createContext<{ close: () => void } | null>(
  null,
);

const accountItems = [
  { label: "Account Settings", href: "/account", icon: Settings },
  { label: "Send Feedback", href: "/feedback", icon: MessageSquare },
];

const legalItems = [
  { label: "Terms of Service", href: "/terms", icon: FileText },
  { label: "Privacy Policy", href: "/privacy", icon: Shield },
];

function getDisplayName(user: ProfileMenuUser) {
  return user.name ?? user.email?.split("@")[0] ?? "Account";
}

function getInitial(user: ProfileMenuUser) {
  return getDisplayName(user).trim().charAt(0).toUpperCase() || "A";
}

export function ProfileMenu({ user, children }: ProfileMenuProps) {
  const [open, setOpen] = React.useState(false);
  const [signingOut, setSigningOut] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const displayName = getDisplayName(user);
  const initial = getInitial(user);
  const isDark = resolvedTheme === "dark";

  const close = React.useCallback(() => setOpen(false), []);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    await fetch("/api/auth/session", { method: "DELETE" });
    await signOut(getFirebaseAuth());
    setOpen(false);
    router.replace("/sign-in");
    router.refresh();
  };

  React.useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-label="Open profile menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex size-8 cursor-pointer items-center justify-center rounded-full border border-border bg-muted text-sm font-semibold text-foreground shadow-sm transition hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {user.picture ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.picture}
            alt={`${displayName} profile photo`}
            className="size-full rounded-full object-cover"
          />
        ) : (
          <span className="flex size-full items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white dark:bg-blue-500">
            {initial}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-12 z-[100] w-[calc(100vw-2rem)] max-w-80 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl isolate"
          style={{ backgroundColor: "var(--popover)" }}
        >
          <div className="flex items-center gap-3 border-b border-border/70 px-5 py-4">
            <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-600 text-base font-semibold text-white dark:bg-blue-500">
              {user.picture ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.picture}
                  alt=""
                  className="size-full object-cover"
                />
              ) : (
                initial
              )}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">
                {displayName}
              </div>
              <div className="truncate text-sm text-muted-foreground">
                {user.email ?? user.uid}
              </div>
            </div>
          </div>

          {children && (
            <MenuContext.Provider value={{ close }}>
              <div className="md:hidden border-b border-border/70">
                {children}
              </div>
            </MenuContext.Provider>
          )}

          <div className="px-2 py-2">
            <div className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground">
              <div className="flex items-center gap-3">
                <Moon className="size-4" />
                <span>Dark mode</span>
              </div>
              <button
                type="button"
                aria-label="Toggle dark mode"
                aria-pressed={isDark}
                onClick={() => setTheme(isDark ? "light" : "dark")}
                className={cn(
                  "flex h-5 w-9 items-center rounded-full p-0.5 transition focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  isDark ? "bg-blue-600" : "bg-muted-foreground/30",
                )}
              >
                <span
                  className={cn(
                    "size-4 rounded-full bg-white shadow-sm transition",
                    isDark && "translate-x-4",
                  )}
                />
              </button>
            </div>
          </div>

          <div className="border-t border-border/70 px-2 py-2">
            {accountItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <Icon className="size-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>

          <div className="border-t border-border/70 px-2 py-2">
            {legalItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <Icon className="size-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>

          <div className="border-t border-border/70 px-2 py-2">
            <button
              type="button"
              role="menuitem"
              onClick={handleSignOut}
              disabled={signingOut}
              className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-destructive transition hover:bg-destructive/10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-60"
            >
              <LogOut className="size-4" />
              <span>{signingOut ? "Signing out..." : "Sign out"}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
