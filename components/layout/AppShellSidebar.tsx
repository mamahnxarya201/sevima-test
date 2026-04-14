'use client';

import Link from 'next/link';
import { useAtomValue } from 'jotai';
import { MaterialIcon } from '../ui/MaterialIcon';
import { tenantNameAtom } from '../../store/workflowStore';

export type ShellNavItem = {
  href: string;
  label: string;
  icon: string;
  active?: boolean;
  badge?: number;
};

type AppShellSidebarProps = {
  items: ShellNavItem[];
};

export function AppShellSidebar({ items }: AppShellSidebarProps) {
  const tenantName = useAtomValue(tenantNameAtom);

  return (
    <aside className="flex min-h-screen w-56 shrink-0 flex-col self-stretch bg-[#f3f4ee] px-3 py-6">
      <div className="mb-10 flex items-center gap-3 px-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#3a6095] shadow-sm">
          <MaterialIcon icon="account_tree" className="text-lg text-white" />
        </div>
        <div className="min-w-0">
          <p className="truncate font-['Manrope'] text-[15px] font-bold leading-tight text-[#2f342e]">
            {tenantName}
          </p>
          <p className="mt-0.5 text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-[#afb3ac]">
            Workspace
          </p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-colors ${
              item.active
                ? 'bg-[#e0e4dc] text-[#3a6095]'
                : 'text-[#2f342e]/70 hover:bg-[#edefe8]'
            }`}
          >
            <MaterialIcon icon={item.icon} className="text-[20px]" />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {typeof item.badge === 'number' && (
              <span
                className={`inline-flex min-w-6 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  item.active ? 'bg-[#3a6095] text-white' : 'bg-[#e0e4dc] text-[#2f342e]/75'
                }`}
              >
                {item.badge}
              </span>
            )}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
