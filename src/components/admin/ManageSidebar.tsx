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
  items: NavItem[];
}

/** Every page in the app, grouped by module — rendered vertically in the left sidebar. */
const NAV_GROUPS: NavGroup[] = [
  {
    key: 'industry',
    label: 'Industry',
    icon: Factory,
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

/** Vertical list of ALL management pages — collapsible groups, folded at load.
 *  Only the group holding the active tab starts open; navigating into another
 *  module expands that group automatically. Styled for the light porcelain sidebar. */
export function SidebarNav({ activeTab, onSelect, isAdmin }: SidebarNavProps) {
  const groups = React.useMemo(() => visibleGroups(isAdmin), [isAdmin]);
  const activeGroupKey = groups.find((g) => g.items.some((i) => i.tab === activeTab))?.key;
  // Start folded: only the active module's group is open at load time.
  const [openGroups, setOpenGroups] = React.useState<string[]>(() =>
    activeGroupKey ? [activeGroupKey] : []
  );

  // When navigation lands on a tab inside a folded group, unfold that group.
  // Runs only when the active group changes, so manual collapsing still sticks.
  React.useEffect(() => {
    if (!activeGroupKey) return;
    setOpenGroups((prev) => (prev.includes(activeGroupKey) ? prev : [...prev, activeGroupKey]));
  }, [activeGroupKey]);

  return (
    <Accordion type="multiple" value={openGroups} onValueChange={setOpenGroups} className="w-full">
      {groups.map((group) => {
        const GroupIcon = group.icon;
        const isGroupActive = group.key === activeGroupKey;
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
              <div className="space-y-0.5 pl-3">
                {group.items.map((item) => {
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
            </AccordionContent>
          </AccordionItem>
        );
      })}
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
