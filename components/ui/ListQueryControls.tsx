'use client';

import { MaterialIcon } from '@/components/ui/MaterialIcon';

type SortOption = {
  value: string;
  label: string;
};

type ListQueryControlsProps = {
  searchLabel?: string;
  searchPlaceholder?: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  sortLabel?: string;
  sortValue: string;
  sortOptions: SortOption[];
  onSortChange: (value: string) => void;
};

export function ListQueryControls({
  searchLabel = 'Search',
  searchPlaceholder = 'Search...',
  searchValue,
  onSearchChange,
  sortLabel = 'Sort',
  sortValue,
  sortOptions,
  onSortChange,
}: ListQueryControlsProps) {
  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="min-w-0 flex-1 sm:min-w-[200px]">
        <label className="mb-1.5 block text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-[#afb3ac]">
          {searchLabel}
        </label>
        <div className="relative">
          <MaterialIcon
            icon="search"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#afb3ac]"
          />
          <input
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-xl border-0 bg-white py-2.5 pl-10 pr-3 text-[13px] text-[#2f342e] shadow-inner outline-none ring-1 ring-[#afb3ac]/15 transition-shadow focus:ring-2 focus:ring-[#3a6095]"
          />
        </div>
      </div>

      <div className="shrink-0">
        <label className="mb-1.5 block text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-[#afb3ac]">
          {sortLabel}
        </label>
        <select
          value={sortValue}
          onChange={(e) => onSortChange(e.target.value)}
          className="rounded-xl border-0 bg-white py-2.5 pl-3 pr-8 text-[13px] font-medium text-[#2f342e] shadow-inner outline-none ring-1 ring-[#afb3ac]/15 transition-shadow focus:ring-2 focus:ring-[#3a6095]"
        >
          {sortOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
