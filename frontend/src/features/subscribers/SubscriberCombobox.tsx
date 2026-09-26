import React, { useState, useEffect, useRef, useCallback } from "react";
import { Search, X, Loader2 } from "lucide-react";
import { api, type Subscriber } from "../../api/client";

interface SubscriberComboboxProps {
  value: Subscriber | null;
  onChange: (subscriber: Subscriber | null) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  status?: string;
  className?: string;
}

export function SubscriberCombobox({
  value,
  onChange,
  label,
  placeholder = "Search by subscriber name, account # (e.g. SUB-), or mobile...",
  required = false,
  disabled = false,
  autoFocus = false,
  status = "ACTIVE",
  className = "",
}: SubscriberComboboxProps) {
  const [isOpen, setIsOpen] = useState(Boolean(autoFocus));
  const [searchQuery, setSearchQuery] = useState("");
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced subscriber search
  const fetchSubscribers = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const res = await api.listSubscribers({
        search: query.trim() || undefined,
        status: status === "ALL" ? undefined : (status || undefined),
        limit: 8,
      });
      setSubscribers(res.data);
    } catch (err) {
      console.error("Failed to load subscribers", err);
      setSubscribers([]);
    } finally {
      setLoading(false);
    }
  }, [status]);

  // Fetch initial active subscribers on mount or open
  useEffect(() => {
    if (!value) {
      fetchSubscribers(searchQuery);
    }
  }, [value, fetchSubscribers]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      fetchSubscribers(searchQuery);
    }, 180);
    return () => clearTimeout(timer);
  }, [searchQuery, isOpen, fetchSubscribers]);

  // Click outside listener
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        setIsOpen(true);
        return;
      }
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < subscribers.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : subscribers.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < subscribers.length) {
        handleSelect(subscribers[highlightedIndex]!);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  const handleSelect = (subscriber: Subscriber) => {
    onChange(subscriber);
    setIsOpen(false);
    setSearchQuery("");
    setHighlightedIndex(-1);
  };

  const handleClear = () => {
    onChange(null);
    setSearchQuery("");
    setIsOpen(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {label && (
        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
          {label}{required ? " *" : ""}
        </label>
      )}

      {value ? (
        /* Selected State: Premium tactile card with instant change trigger */
        <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl flex items-center justify-between transition-all shadow-xs">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
              {value.firstName[0]}
              {value.lastName[0]}
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-slate-900 text-sm truncate flex items-center gap-1.5">
                <span>
                  {value.firstName} {value.lastName}
                </span>
                {value.businessName && (
                  <span className="text-xs text-slate-500 font-normal truncate">
                    ({value.businessName})
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-500 font-mono flex items-center gap-2">
                <span className="bg-white px-1.5 py-0.5 rounded border border-blue-100 font-semibold text-blue-700">
                  {value.accountNumber}
                </span>
                {value.primaryContactNumber && (
                  <span className="truncate">{value.primaryContactNumber}</span>
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClear}
            disabled={disabled}
            className="text-xs text-blue-600 hover:text-blue-800 font-semibold px-2.5 py-1 rounded-md hover:bg-blue-100/60 transition-colors cursor-pointer active:scale-95"
            title="Change subscriber"
          >
            Change
          </button>
        </div>
      ) : (
        /* Search Input */
        <div className="relative">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              autoFocus={autoFocus}
              disabled={disabled}
              placeholder={placeholder}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (!isOpen) setIsOpen(true);
              }}
              onFocus={() => setIsOpen(true)}
              onKeyDown={handleKeyDown}
              className="w-full pl-9 pr-10 py-2.5 text-sm bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 outline-none transition-all placeholder:text-slate-400 shadow-xs"
            />
            {loading ? (
              <Loader2 className="w-4 h-4 text-blue-600 animate-spin absolute right-3 pointer-events-none" />
            ) : searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 p-0.5 text-slate-400 hover:text-slate-600 rounded"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : null}
          </div>

          {/* Floating Dropdown Listbox */}
          {isOpen && (
            <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white border border-slate-200 rounded-xl shadow-xl max-h-64 overflow-y-auto divide-y divide-slate-100 animate-in fade-in zoom-in-95 duration-100">
              {subscribers.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500">
                  {loading ? (
                    <div className="flex items-center justify-center gap-2 text-slate-500">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                      <span>Searching active subscribers...</span>
                    </div>
                  ) : (
                    <span>No active subscribers found</span>
                  )}
                </div>
              ) : (
                subscribers.map((s, idx) => {
                  const isHighlighted = idx === highlightedIndex;
                  return (
                    <div
                      key={s.id}
                      onClick={() => handleSelect(s)}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      className={`p-3 cursor-pointer flex items-center justify-between text-xs transition-colors ${
                        isHighlighted ? "bg-blue-50 text-blue-900" : "hover:bg-slate-50 text-slate-800"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-700 font-semibold flex items-center justify-center shrink-0">
                          {s.firstName[0]}
                          {s.lastName[0]}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 truncate">
                            {s.firstName} {s.lastName}
                            {s.businessName && (
                              <span className="text-slate-500 font-normal ml-1">
                                ({s.businessName})
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                            <span className="text-slate-400 font-mono">({s.accountNumber})</span>
                            {s.primaryContactNumber && (
                              <span className="ml-1.5 text-slate-400">
                                • {s.primaryContactNumber}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <span className="text-[11px] font-medium text-blue-600 shrink-0 ml-2">
                        Select
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
