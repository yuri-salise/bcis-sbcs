import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "none";
  actions?: React.ReactNode;
  hideHeader?: boolean;
}

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  icon,
  children,
  maxWidth = "lg",
  actions,
  hideHeader = false,
}: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const maxWidthClass = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
    "2xl": "max-w-2xl",
    "3xl": "max-w-3xl",
    "4xl": "max-w-4xl",
    none: "max-w-none w-full mx-4",
  }[maxWidth];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      style={{ animation: "fadeIn 150ms ease-out forwards" }}
    >
      <div
        ref={overlayRef}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
      
      <div
        className={cn(
          "relative bg-white rounded-2xl shadow-2xl border border-slate-200/60 w-full flex flex-col max-h-[92vh] overflow-hidden",
          maxWidthClass,
          "print:m-0 print:p-0 print:shadow-none print:max-w-none print:w-full print:border-none print:overflow-visible"
        )}
        style={{
          animation: "modalEnter 200ms cubic-bezier(0.16, 1, 0.3, 1) forwards",
        }}
        role="dialog"
        aria-modal="true"
      >
        {!hideHeader && (
          <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between bg-white/50 backdrop-blur-md sticky top-0 z-10 print:hidden">
            <div className="flex gap-4">
              {icon && (
                <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-700 shrink-0 border border-slate-200/50">
                  {icon}
                </div>
              )}
              <div>
                {title && (
                  <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                    {title}
                  </h3>
                )}
                {description && (
                  <p className="text-sm text-slate-500 mt-0.5 leading-relaxed">
                    {description}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 -mr-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors active-press focus-visible:outline-2 focus-visible:outline-blue-500"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        <div className="p-6 overflow-y-auto flex-1 overscroll-contain print:p-0 print:overflow-visible">
          {children}
        </div>

        {actions && (
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3 sticky bottom-0 z-10 print:hidden">
            {actions}
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes modalEnter {
          from { 
            opacity: 0;
            transform: scale(0.96) translateY(4px);
          }
          to { 
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}} />
    </div>
  );
}
