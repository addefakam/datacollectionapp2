'use client';

import * as React from 'react';
import {
  BarChart3,
  Building2,
  Calendar,
  ClipboardList,
  Database,
  Factory,
  GraduationCap,
  LogOut,
  Menu,
  PieChart,
  RefreshCw,
  Rocket,
  Shield,
  Sprout,
  Store,
  Stethoscope,
  Target,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { signOut } from 'next-auth/react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

interface NavItem {
  tab: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

interface NavGroup {
  key: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  /** Sidebar band this module belongs to: sector data collection vs. city initiatives. */
  section?: 'data' | 'initiatives' | 'admin';
  items: NavItem[];
}

/** Section header rendered above the sector module groups. */
const DATA_SECTION_LABEL = 'Data Collection';

/** Every page in the app, grouped by module — rendered vertically in the left sidebar. */
const NAV_GROUPS: NavGroup[] = [
  {
    key: 'industry',
    label: 'Industry',
    icon: Factory,
    section: 'data',
    items: [
      { tab: 'survey', label: 'Survey', icon: ClipboardList },
      { tab: 'indData', label: 'Records', icon: Database, adminOnly: true },
      { tab: 'indStats', label: 'Stats', icon: BarChart3, adminOnly: true },
      { tab: 'attInd', label: 'Attendance', icon: Users },
    ],
  },
  {
    key: 'hotel',
    label: 'Hotel',
    icon: Building2,
    section: 'data',
    items: [
      { tab: 'hotelSurvey', label: 'Survey', icon: ClipboardList },
      { tab: 'hotelData', label: 'Records', icon: Database, adminOnly: true },
      { tab: 'hotelStats', label: 'Stats', icon: BarChart3, adminOnly: true },
      { tab: 'attHotel', label: 'Attendance', icon: Users },
    ],
  },
  {
    key: 'health',
    label: 'Health',
    icon: Stethoscope,
    section: 'data',
    items: [
      { tab: 'healthSurvey', label: 'Survey', icon: ClipboardList },
      { tab: 'healthData', label: 'Records', icon: Database, adminOnly: true },
      { tab: 'healthStats', label: 'Stats', icon: BarChart3, adminOnly: true },
    ],
  },
  {
    key: 'education',
    label: 'Education',
    icon: GraduationCap,
    section: 'data',
    items: [
      { tab: 'eduSurvey', label: 'Survey', icon: ClipboardList },
      { tab: 'eduData', label: 'Records', icon: Database, adminOnly: true },
      { tab: 'eduStats', label: 'Stats', icon: BarChart3, adminOnly: true },
    ],
  },
  {
    key: 'agriculture',
    label: 'Agriculture',
    icon: Sprout,
    section: 'data',
    items: [
      { tab: 'agriSurvey', label: 'Survey', icon: ClipboardList },
      { tab: 'agriData', label: 'Records', icon: Database, adminOnly: true },
      { tab: 'agriStats', label: 'Stats', icon: BarChart3, adminOnly: true },
    ],
  },
  {
    key: 'small-enterprise',
    label: 'Small Enterprise',
    icon: Store,
    section: 'initiatives',
    items: [
      { tab: 'mseSurvey', label: 'Survey', icon: ClipboardList },
      { tab: 'mseData', label: 'Records', icon: Database, adminOnly: true },
      { tab: 'mseStats', label: 'Stats', icon: BarChart3, adminOnly: true },
      { tab: 'mseGoals', label: 'Goals', icon: Target, adminOnly: true },
    ],
  },
  {
    key: 'administration',
    label: 'Administration',
    icon: Wrench,
    adminOnly: true,
    items: [
      { tab: 'analytics', label: 'Analytics', icon: PieChart },
      { tab: 'meetings', label: 'Meetings', icon: Calendar },
      { tab: 'settings', label: 'Settings', icon: Wrench },
      { tab: 'admin', label: 'Users', icon: Shield },
    ],
  },
];

/** Role-filtered copy of NAV_GROUPS (admin-only groups/items dropped for collectors). */
function visibleGroups(isAdmin: boolean): NavGroup[] {
  return NAV_GROUPS
    .filter((g) => isAdmin || !g.adminOnly)
    .map((g) => ({ ...g, items: g.items.filter((i) => isAdmin || !i.adminOnly) }))
    .filter((g) => g.items.length > 0);
}

interface SidebarNavProps {
  activeTab: string;
  onSelect: (tab: string) => void;
  isAdmin: boolean;
}

/** Vertical list of ALL management pages — collapsible, folded at load.
 *  Sector modules sit directly under the sidebar; initiative modules (e.g. Small
 *  Enterprise) are listed inside the expandable "Initiatives" tab — expanding it
 *  shows the initiatives, each unfolding to its Survey/Records/Stats/Goals pages.
 *  Styled for the light porcelain sidebar. */
export function SidebarNav({ activeTab, onSelect, isAdmin }: SidebarNavProps) {
  const groups = React.useMemo(() => visibleGroups(isAdmin), [isAdmin]);
  const dataGroups = groups.filter((g) => g.section === 'data');
  const initiativeModules = groups.filter((g) => g.section === 'initiatives');
  const adminGroups = groups.filter((g) => !g.section || g.section === 'admin');

  const activeModuleKey = initiativeModules.find((m) => m.items.some((i) => i.tab === activeTab))?.key;
  const activePlainGroup = groups
    .filter((g) => g.section !== 'initiatives')
    .find((g) => g.items.some((i) => i.tab === activeTab))?.key;

  // Start folded: at load only the active tab's own path is open, everything
  // else (including the Initiatives tab) stays collapsed until clicked.
  const [openGroups, setOpenGroups] = React.useState<string[]>(() =>
    activeModuleKey ? ['initiatives'] : activePlainGroup ? [activePlainGroup] : []
  );
  const [openModules, setOpenModules] = React.useState<string[]>(() =>
    activeModuleKey ? [activeModuleKey] : []
  );

  // When navigation lands inside a folded area, unfold exactly that path.
  // Runs only when the destination changes, so manual collapsing still sticks.
  React.useEffect(() => {
    if (activeModuleKey) {
      setOpenGroups((prev) => (prev.includes('initiatives') ? prev : [...prev, 'initiatives']));
      setOpenModules((prev) => (prev.includes(activeModuleKey) ? prev : [...prev, activeModuleKey]));
    } else if (activePlainGroup) {
      setOpenGroups((prev) => (prev.includes(activePlainGroup) ? prev : [...prev, activePlainGroup]));
    }
  }, [activeModuleKey, activePlainGroup]);

  const renderPageButtons = (items: NavItem[]) => (
    <div className="space-y-0.5 pl-3">
      {items.map((item) => {
        const ItemIcon = item.icon;
        const isActive = activeTab === item.tab;
        return (
          <button
            key={item.tab}
            type="button"
            onClick={() => onSelect(item.tab)}
            className={cn(
              'flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-left text-[13px] transition-colors',
              isActive
                ? 'bg-brand-gradient font-semibold text-white shadow-md shadow-emerald-600/25'
                : 'text-emerald-950/60 hover:bg-emerald-900/[0.06] hover:text-emerald-950'
            )}
          >
            <ItemIcon className="h-4 w-4 shrink-0" />
            <span className="truncate">{item.label}</span>
          </button>
        );
      })}
    </div>
  );

  const renderModuleGroup = (group: NavGroup) => {
    const GroupIcon = group.icon;
    const isGroupActive = group.key === activePlainGroup;
    return (
      <AccordionItem key={group.key} value={group.key} className="rounded-xl border-b-0">
        <AccordionTrigger
          className={cn(
            'items-center gap-2 rounded-xl px-2.5 py-2.5 text-[13px] font-bold no-underline transition-colors hover:bg-emerald-900/[0.06] hover:no-underline data-[state=open]:bg-emerald-900/[0.06] [&>svg]:size-3.5 [&>svg]:shrink-0 [&>svg]:translate-y-0 [&>svg]:text-emerald-700/50',
            isGroupActive && 'bg-emerald-900/[0.06]'
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all',
                isGroupActive
                  ? 'bg-brand-gradient text-white shadow-md shadow-emerald-600/25'
                  : 'bg-emerald-800/10 text-emerald-800'
              )}
            >
              <GroupIcon className="h-3.5 w-3.5" />
            </span>
            <span className="truncate uppercase tracking-wide text-emerald-950/75">{group.label}</span>
          </span>
        </AccordionTrigger>
        <AccordionContent className="pb-1.5 pt-0.5">
          {renderPageButtons(group.items)}
        </AccordionContent>
      </AccordionItem>
    );
  };

  return (
    <Accordion type="multiple" value={openGroups} onValueChange={setOpenGroups} className="w-full">
      {dataGroups.length > 0 && (
        <p className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-800/45">
          {DATA_SECTION_LABEL}
        </p>
      )}
      {dataGroups.map((group) => renderModuleGroup(group))}

      {initiativeModules.length > 0 && (
        <AccordionItem value="initiatives" className="mt-3 rounded-xl border-b-0">
          <AccordionTrigger
            className={cn(
              'items-center gap-2 rounded-xl px-2.5 py-2.5 text-[13px] font-bold no-underline transition-colors hover:bg-emerald-900/[0.06] hover:no-underline data-[state=open]:bg-emerald-900/[0.06] [&>svg]:size-3.5 [&>svg]:shrink-0 [&>svg]:translate-y-0 [&>svg]:text-emerald-700/50',
              activeModuleKey && 'bg-emerald-900/[0.06]'
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all',
                  activeModuleKey
                    ? 'bg-brand-gradient text-white shadow-md shadow-emerald-600/25'
                    : 'bg-emerald-800/10 text-emerald-800'
                )}
              >
                <Rocket className="h-3.5 w-3.5" />
              </span>
              <span className="truncate uppercase tracking-wide text-emerald-950/75">Initiatives</span>
            </span>
          </AccordionTrigger>
          <AccordionContent className="pb-1.5 pt-0.5">
            {/* Expandable list of initiatives — one nested accordion per initiative module. */}
            <Accordion type="multiple" value={openModules} onValueChange={setOpenModules} className="w-full">
              {initiativeModules.map((module) => {
                const ModuleIcon = module.icon;
                const isModuleActive = module.key === activeModuleKey;
                return (
                  <AccordionItem key={module.key} value={module.key} className="rounded-xl border-b-0">
                    <AccordionTrigger
                      className={cn(
                        'items-center gap-2 rounded-lg px-2 py-2 text-[12px] font-semibold no-underline transition-colors hover:bg-emerald-900/[0.06] hover:no-underline data-[state=open]:bg-emerald-900/[0.06] [&>svg]:size-3 [&>svg]:shrink-0 [&>svg]:translate-y-0 [&>svg]:text-emerald-700/50',
                        isModuleActive && 'bg-emerald-900/[0.06]'
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <ModuleIcon
                          className={cn('h-3.5 w-3.5 shrink-0', isModuleActive ? 'text-emerald-700' : 'text-emerald-800/70')}
                        />
                        <span className="truncate text-emerald-950/80">{module.label}</span>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="pb-1 pt-0.5">
                      {renderPageButtons(module.items)}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </AccordionContent>
        </AccordionItem>
      )}

      {adminGroups.map((group) => renderModuleGroup(group))}
    </Accordion>
  );
}

interface AppSidebarProps {
  activeTab: string;
  onSelect: (tab: string) => void;
  isAdmin: boolean;
  userName?: string | null;
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  onSync: () => void;
}

/** Desktop (lg+): sticky left column with brand, full vertical nav and account actions. */
export function AppSidebar({
  activeTab,
  onSelect,
  isAdmin,
  userName,
  isOnline,
  pendingCount,
  isSyncing,
  onSync,
}: AppSidebarProps) {
  return (
    <aside className="surface-sidebar nav-scroll sticky top-0 z-40 hidden h-[100dvh] w-60 shrink-0 flex-col overflow-y-auto border-r border-emerald-900/10 text-emerald-950 shadow-[10px_0_30px_-24px_rgba(6,58,48,0.35)] lg:flex">
      {/* Brand */}
      <div className="flex items-center gap-2.5 border-b border-emerald-900/10 px-4 pb-3.5 pt-5">
        <img
          src="/icon.png"
          alt="Dhibayyuu Data Collection"
          className="h-10 w-10 shrink-0 rounded-xl bg-white p-0.5 shadow-sm ring-1 ring-emerald-900/15"
        />
        <div className="min-w-0">
          <p className="truncate font-display text-[13px] font-bold leading-tight text-emerald-950">Qorannoo Dhibayyuu</p>
          <p className="truncate text-[10px] font-medium text-emerald-800/60">Dhibayyuu Sub-City</p>
        </div>
      </div>

      {/* Full vertical management list */}
      <nav className="flex-1 px-2.5 pb-3 pt-2.5" aria-label="Management navigation">
        <p className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-800/45">
          Manage / Bulchiinsa
        </p>
        <SidebarNav activeTab={activeTab} onSelect={onSelect} isAdmin={isAdmin} />
      </nav>

      {/* Account + sync */}
      <div className="border-t border-emerald-900/10 p-3">
        <div className="flex items-center gap-2.5 rounded-xl bg-emerald-800/[0.06] px-2.5 py-2 ring-1 ring-emerald-900/10">
          <span className="bg-brand-gradient flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white shadow-md shadow-emerald-600/25">
            {(userName || 'U').slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-emerald-950">{userName || 'User'}</p>
            <p className="truncate text-[10px] text-emerald-800/60">
              {isAdmin ? 'Administrator' : 'Data Collector'}
            </p>
          </div>
        </div>
        {pendingCount > 0 && isOnline && (
          <button
            type="button"
            onClick={onSync}
            disabled={isSyncing}
            className="mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-50 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-60"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isSyncing && 'animate-spin')} />
            <span>
              {pendingCount} pending — Sync
            </span>
          </button>
        )}
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: '/' })}
          className="mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-emerald-900/15 text-xs font-semibold text-emerald-950/80 transition-colors hover:bg-emerald-900/[0.06]"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}

interface MobileSidebarProps {
  activeTab: string;
  onSelect: (tab: string) => void;
  isAdmin: boolean;
}

/** Mobile/tablet (<lg): hamburger in the header opens the same vertical list as a drawer. */
export function MobileSidebar({ activeTab, onSelect, isAdmin }: MobileSidebarProps) {
  const [open, setOpen] = React.useState(false);
  // Remount on open so every group is expanded again
  const [menuEpoch, setMenuEpoch] = React.useState(0);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setMenuEpoch((e) => e + 1);
      }}
    >
      <SheetTrigger asChild>
        <button
          type="button"
          title="Menu / furtuu"
          aria-label="Open navigation menu"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-emerald-900/70 transition-colors hover:bg-emerald-900/[0.07] hover:text-emerald-950 sm:h-9 sm:w-9"
        >
          <Menu className="h-4 w-4 sm:h-5 sm:w-5" />
        </button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="surface-sidebar w-[300px] gap-0 overflow-hidden border-emerald-900/10 p-0 text-emerald-950 sm:max-w-[300px]"
      >
        <SheetHeader className="gap-1 rounded-none border-b border-emerald-900/10 bg-white/60 p-4 text-left">
          <SheetTitle className="flex items-center gap-2 font-display text-base font-bold text-emerald-950">
            <Wrench className="h-4 w-4" />
            Manage / Bulchiinsa
          </SheetTitle>
          <SheetDescription className="text-xs text-emerald-800/60">
            All modules in one place / Module hundii bakka tokkotti
          </SheetDescription>
        </SheetHeader>
        <div className="nav-scroll flex-1 overflow-y-auto p-2">
          <SidebarNav
            key={menuEpoch}
            activeTab={activeTab}
            onSelect={(tab) => {
              onSelect(tab);
              setOpen(false);
            }}
            isAdmin={isAdmin}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
