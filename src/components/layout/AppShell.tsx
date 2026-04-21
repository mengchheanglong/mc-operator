'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAppState } from '@/state/app-store';
import { projects } from '@/features/projects/api';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import {
  Activity,
  Bot,
  Cpu,
  Eye,
  FileText,
  FolderOpen,
  LayoutDashboard,
  ScrollText,
  Settings,
  StickyNote,
  Workflow,
} from 'lucide-react';

const navigation = [
  { name: 'Health', href: '/health', icon: Activity },
  { name: 'Quests', href: '/quests', icon: ScrollText },
  { name: 'Reports', href: '/reports', icon: FileText },
  { name: 'Docs', href: '/docs', icon: FileText },
  { name: 'Notes', href: '/notes', icon: StickyNote },
  { name: 'Projects', href: '/projects', icon: FolderOpen },
  { name: 'Views', href: '/views', icon: Eye },
  { name: 'Agents', href: '/agents', icon: Bot },
  { name: 'Automation', href: '/automation', icon: Cpu },
  { name: 'Directive', href: '/directive', icon: Workflow },
  { name: 'Ops', href: '/ops', icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { activeProject, backendConnected } = useAppState();
  const { setActiveProject } = useAppState();

  const { data: activeProjectPayload, isLoading: isLoadingActiveProject } = useQuery({
    queryKey: ['projects', 'active'],
    queryFn: projects.active,
    retry: false,
  });

  useEffect(() => {
    const backendActiveProjectId = activeProjectPayload?.activeProject?.id;
    if (typeof backendActiveProjectId === 'string' && backendActiveProjectId !== activeProject) {
      setActiveProject(backendActiveProjectId);
    }
  }, [activeProject, activeProjectPayload?.activeProject?.id, setActiveProject]);

  return (
    <div className="min-h-screen bg-[#090a0d] text-gray-50">
      <header className="sticky top-0 z-20 border-b border-white/6 bg-[#0d1016]/90 backdrop-blur-xl">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/4 shadow-[0_14px_34px_rgba(0,0,0,0.28)] ring-1 ring-white/8">
              <LayoutDashboard className="h-5 w-5 text-blue-300" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-white">Mission Control</h1>
              <p className="text-xs uppercase tracking-[0.22em] text-gray-500">Operator Surface</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1.5 text-sm text-emerald-300 ring-1 ring-emerald-500/18">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  backendConnected ? 'bg-emerald-400 shadow-[0_0_14px_rgba(74,222,128,0.75)]' : 'bg-red-400'
                }`}
              />
              <span>{backendConnected ? 'Backend Connected' : 'Backend Disconnected'}</span>
            </div>

            <div className="rounded-full bg-blue-500/12 px-3 py-1.5 text-sm font-medium text-blue-200 ring-1 ring-blue-400/16">
              Project: {activeProject}
            </div>
          </div>
        </div>
      </header>

      <div className="flex">
        <aside className="sticky top-18.25 min-h-[calc(100vh-4.5625rem)] w-64 border-r border-white/6 bg-[#0b0d12]/92">
          <nav className="space-y-2 p-4">
            {navigation.map((item) => {
              const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`group flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium ${
                    isActive
                      ? 'bg-blue-500/16 text-blue-200 shadow-[inset_0_0_0_1px_rgba(122,162,255,0.16)]'
                      : 'text-slate-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <item.icon
                    className={`h-5 w-5 ${
                      isActive ? 'text-blue-300' : 'text-slate-400 group-hover:text-slate-200'
                    }`}
                  />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="flex-1 px-6 py-6">
          {isLoadingActiveProject ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
              Loading workspace state...
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
