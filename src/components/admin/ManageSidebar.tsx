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
  RefreshCw,
  Shield,
  Sprout,
  Stethoscope,
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
import { Button } from '@/components/ui/button';
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
    key: 'administration',
    label: 'Administration',
    icon: Wrench,
    adminOnly: true,
    items: [
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

/** Vertical list of ALL management pages — collapsible groups, expanded by default. */
export function SidebarNav({ activeTab, onSelect, isAdmin }: SidebarNavProps) {
  const groups = React.useMemo(() => visibleGroups(isAdmin), [isAdmin]);
  const [openGroups, setOpenGroups] = React.useState<string[]>(() => groups.map((g) => g.key));
  const activeGroupKey = groups.find((g) => g.items.some((i) => i.tab === activeTab))?.key;

  return (
    <Accordion type="multiple" value={openGroups} onValueChange={setOpenGroups} className="w-full">
      {groups.map((group) => {
        const GroupIcon = group.icon;
        const isGroupActive = group.key === activeGroupKey;
        return (
          <AccordionItem key={group.key} value={group.key} className="rounded-xl border-b-0">
            <AccordionTrigger
              className={cn(
                'items-center gap-2 rounded-xl px-2.5 py-2.5 text-[13px] font-bold no-underline transition-colors hover:bg-teal-50 hover:no-underline data-[state=open]:bg-teal-50/60 [&>svg]:size-3.5 [&>svg]:shrink-0 [&>svg]:translate-y-0 [&>svg]:text-teal-600',
                isGroupActive && 'bg-teal-50/60'
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors',
                    isGroupActive
                      ? 'bg-teal-600 text-white shadow-sm shadow-teal-600/30'
                      : 'bg-teal-50 text-teal-700'
                  )}
                >
                  <GroupIcon className="h-3.5 w-3.5" />
                </span>
                <span className="truncate uppercase tracking-wide text-teal-900/80">{group.label}</span>
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
                          ? 'bg-teal-600 font-semibold text-white shadow-sm shadow-teal-600/30'
                          : 'text-teal-900/75 hover:bg-teal-100/70 hover:text-teal-900'
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
    <aside className="sticky top-0 z-40 hidden h-[100dvh] w-60 shrink-0 flex-col border-r border-teal-100 bg-white lg:flex">
      {/* Brand */}
      <div className="flex items-center gap-2.5 border-b border-teal-100/80 px-4 pb-3.5 pt-5">
        <img src="/icon.png" alt="Bishoftu Data Collection" className="h-10 w-10 shrink-0 rounded-xl" />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-bold leading-tight text-teal-900">Qorannoo Indastrii</p>
          <p className="truncate text-[10px] text-muted-foreground">Bishoftu Data Collection</p>
        </div>
      </div>

      {/* Full vertical management list */}
      <nav className="flex-1 overflow-y-auto px-2.5 pb-3 pt-2.5" aria-label="Management navigation">
        <p className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-teal-900/40">
          Manage / Bulchiinsa
        </p>
        <SidebarNav activeTab={activeTab} onSelect={onSelect} isAdmin={isAdmin} />
      </nav>

      {/* Account + sync */}
      <div className="border-t border-teal-100/80 p-3">
        <div className="flex items-center gap-2.5 rounded-xl border border-teal-100 bg-teal-50/50 px-2.5 py-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-600 text-xs font-bold text-white">
            {(userName || 'U').slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-teal-900">{userName || 'User'}</p>
            <p className="truncate text-[10px] text-muted-foreground">
              {isAdmin ? 'Administrator' : 'Data Collector'}
            </p>
          </div>
        </div>
        {pendingCount > 0 && isOnline && (
          <Button
            variant="outline"
            size="sm"
            className="mt-2 w-full justify-center border-amber-400 text-amber-700 hover:bg-amber-50"
            onClick={onSync}
            disabled={isSyncing}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isSyncing && 'animate-spin')} />
            <span className="text-xs font-semibold">{pendingCount} pending — Sync</span>
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className="mt-2 w-full justify-center"
          onClick={() => signOut({ callbackUrl: '/' })}
        >
          <LogOut className="h-3.5 w-3.5" />
          <span className="text-xs font-semibold">Logout</span>
        </Button>
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
          className="flex h-8 w-8 items-center justify-center rounded-lg text-teal-900/70 transition-colors hover:bg-teal-100/80 hover:text-teal-900 sm:h-9 sm:w-9"
        >
          <Menu className="h-4 w-4 sm:h-5 sm:w-5" />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[300px] gap-0 p-0 sm:max-w-[300px]">
        <SheetHeader className="gap-1 rounded-none border-b border-teal-100 bg-gradient-to-br from-teal-600 to-teal-700 p-4 text-left">
          <SheetTitle className="flex items-center gap-2 text-base font-bold text-white">
            <Wrench className="h-4 w-4" />
            Manage / Bulchiinsa
          </SheetTitle>
          <SheetDescription className="text-xs text-teal-50/90">
            All modules in one place / Module hundii bakka tokkotti
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-2">
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
