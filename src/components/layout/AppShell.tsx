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
  Gauge,
  LayoutDashboard,
  Network,
  ScrollText,
  Settings,
  StickyNote,
  Workflow,
} from 'lucide-react';
import { cn } from '@/components/ui/primitives';

type NavItem = {
  name: string;
  href: string;
  icon: typeof Activity;
  group: string;
};

const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard, group: 'Overview' },
  { name: 'Quests', href: '/quests', icon: ScrollText, group: 'Work' },
  { name: 'Reports', href: '/reports', icon: FileText, group: 'Work' },
  { name: 'Docs', href: '/docs', icon: FileText, group: 'Knowledge' },
  { name: 'Notes', href: '/notes', icon: StickyNote, group: 'Knowledge' },
  { name: 'Projects', href: '/projects', icon: FolderOpen, group: 'Workspace' },
  { name: 'Views', href: '/views', icon: Eye, group: 'Workspace' },
  { name: 'Agents', href: '/agents', icon: Bot, group: 'Automation' },
  { name: 'Automation', href: '/automation', icon: Cpu, group: 'Automation' },
  { name: 'Directive', href: '/directive', icon: Workflow, group: 'Automation' },
  { name: 'Health', href: '/health', icon: Activity, group: 'System' },
  { name: 'Code Graph', href: '/code-graph', icon: Network, group: 'System' },
  { name: 'Ops', href: '/ops', icon: Settings, group: 'System' },
];

const navigationGroups = ['Overview', 'Work', 'Knowledge', 'Workspace', 'Automation', 'System'];

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

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname?.startsWith(`${href}/`);

  const activeRoute =
    navigation.find((item) => isActive(item.href)) ?? navigation[0];
  const activeProjectName = activeProjectPayload?.activeProject?.name || activeProject;

  const renderNavItem = (item: NavItem, compact = false) => {
    const active = isActive(item.href);
    return (
      <Link
        key={`${item.group}-${item.name}`}
        href={item.href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'group relative flex items-center gap-3 rounded-lg border px-3 text-sm font-medium outline-none transition focus-visible:ring-4 focus-visible:ring-blue-400/20',
          compact ? 'h-10 shrink-0' : 'h-10',
          active
            ? 'border-blue-300/24 bg-blue-400/12 text-blue-100 mc-shadow-inset-hl'
            : 'border-transparent text-slate-400 hover:border-white/8 hover:bg-white/[0.045] hover:text-slate-100',
        )}
      >
        {active && (
          <span
            aria-hidden="true"
            className="absolute -left-4 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full bg-blue-300 mc-nav-active-bar"
          />
        )}
        <item.icon
          className={cn(
            'h-4 w-4 shrink-0 transition',
            active ? 'text-blue-200' : 'text-slate-500 group-hover:text-slate-300',
          )}
        />
        <span className="whitespace-nowrap">{item.name}</span>
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-[#090a0d] text-slate-50">
      <header className="sticky top-0 mc-z-header border-b border-white/8 bg-[#0b0d11]/88 backdrop-blur-xl">
        <div className="flex h-16 items-center justify-between gap-4 px-4 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-[linear-gradient(135deg,rgba(67,112,255,0.18),rgba(143,92,255,0.12))] mc-shadow-md transition hover:border-blue-300/30"
              aria-label="Mission Control home"
            >
              <LayoutDashboard className="h-5 w-5 text-blue-200" />
            </Link>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold tracking-tight text-white">
                Mission Control
              </h1>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                <span className="hidden sm:inline">{activeRoute.group}</span>
                <span aria-hidden="true" className="hidden h-1 w-1 rounded-full bg-slate-700 sm:inline" />
                <span className="text-slate-300">{activeRoute.name}</span>
              </div>
            </div>
          </div>

          <div className="flex min-w-0 items-center gap-2">
            <div
              className={cn(
                'hidden items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold sm:flex',
                backendConnected
                  ? 'border-emerald-300/20 bg-emerald-400/10 text-emerald-100'
                  : 'border-rose-300/20 bg-rose-400/10 text-rose-100',
              )}
              role="status"
              aria-live="polite"
            >
              <span
                className={cn(
                  'h-2 w-2 rounded-full',
                  backendConnected
                    ? 'bg-emerald-300 mc-shadow-glow-emerald mc-blink'
                    : 'bg-rose-300',
                )}
              />
              {backendConnected ? 'Connected' : 'Disconnected'}
            </div>

            <Link
              href="/projects"
              className="flex min-w-0 max-w-[42vw] items-center gap-2 rounded-lg border border-white/10 bg-white/[0.055] px-3 py-1.5 text-xs font-semibold text-slate-200 outline-none transition hover:border-blue-300/20 hover:bg-white/[0.08] focus-visible:ring-4 focus-visible:ring-blue-400/20 sm:max-w-sm"
              aria-label={`Active project: ${activeProjectName}. Switch project.`}
            >
              <FolderOpen className="h-4 w-4 shrink-0 text-amber-200" />
              <span className="truncate">{activeProjectName}</span>
            </Link>
          </div>
        </div>

        <nav
          aria-label="Primary"
          className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2 lg:hidden"
        >
          {navigation.map((item) => renderNavItem(item, true))}
        </nav>
      </header>

      <div className="flex">
        <aside
          className="sticky top-16 hidden h-[calc(100vh-4rem)] w-[17rem] shrink-0 border-r border-white/8 bg-[#090b0f]/82 lg:block"
          aria-label="Sidebar"
        >
          <nav className="flex h-full flex-col gap-5 overflow-y-auto p-4 mc-scrollbar-thin">
            {navigationGroups.map((group) => {
              const items = navigation.filter((item) => item.group === group);
              if (items.length === 0) return null;
              return (
                <div key={group} className="space-y-2">
                  <div className="px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                    {group}
                  </div>
                  <div className="space-y-1 pl-1">{items.map((item) => renderNavItem(item))}</div>
                </div>
              );
            })}
            <div className="mt-auto px-3 pt-4">
              <div className="flex items-center gap-2 rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2 text-[11px] text-slate-600">
                <Gauge className="h-3.5 w-3.5 shrink-0 text-slate-600" />
                <span>Local-first · v1.0</span>
              </div>
            </div>
          </nav>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-6 lg:px-8">
          {isLoadingActiveProject ? (
            <div className="rounded-lg border border-white/10 bg-white/[0.055] p-4 text-sm text-slate-300">
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
