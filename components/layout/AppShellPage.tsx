'use client';

import type { ReactNode } from 'react';
import { AppShellSidebar, type ShellNavItem } from '@/components/layout/AppShellSidebar';

type AppShellPageProps = {
  sidebarItems: ShellNavItem[];
  title: string;
  description?: string;
  headerRight?: ReactNode;
  children: ReactNode;
  mainClassName?: string;
  contentClassName?: string;
};

export function AppShellPage({
  sidebarItems,
  title,
  description,
  headerRight,
  children,
  mainClassName,
  contentClassName,
}: AppShellPageProps) {
  return (
    <div className={`flex min-h-screen items-stretch bg-[#fafaf5] font-sans text-[#2f342e] ${mainClassName ?? ''}`}>
      <AppShellSidebar items={sidebarItems} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 bg-[#fafaf5]/85 px-8 py-6 backdrop-blur-[20px]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="font-['Manrope'] text-2xl font-bold tracking-tight text-[#2f342e]">{title}</h1>
              {description ? <p className="mt-1 max-w-xl text-[13px] text-[#afb3ac]">{description}</p> : null}
            </div>
            {headerRight ? <div className="shrink-0">{headerRight}</div> : null}
          </div>
        </header>

        <main className={`flex-1 px-8 py-8 ${contentClassName ?? ''}`}>{children}</main>
      </div>
    </div>
  );
}
