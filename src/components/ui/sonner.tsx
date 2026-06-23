"use client";

import type { CSSProperties } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * Toasts do projeto. Segue o tema do sistema (prefers-color-scheme) e mapeia as
 * cores para os tokens do design system. Ver docs/design-system.md §6.
 */
function Toaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      theme="system"
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-border": "var(--border)",
          "--normal-text": "var(--popover-foreground)",
          "--success-bg": "var(--popover)",
          "--success-border": "var(--border)",
          "--success-text": "var(--popover-foreground)",
          "--error-bg": "var(--popover)",
          "--error-border": "var(--destructive)",
          "--error-text": "var(--popover-foreground)",
        } as CSSProperties
      }
      {...props}
    />
  );
}

export { Toaster };
