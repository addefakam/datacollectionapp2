'use client';

import * as React from 'react';
import {
  BarChart3,
  Building2,
  Calendar,
  ChevronDown,
  Database,
  Factory,
  GraduationCap,
  Menu,
  Shield,
  Sprout,
  Stethoscope,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

interface ManageMenuItem {
  tab: string;
  label: string;
  icon: LucideIcon;
}

interface ManageMenuGroup {
  key: string;
  label: string;
  icon: LucideIcon;
  items: ManageMenuItem[];
}

/** Groups shown in the vertical Manage menu — mirrors the former dropdown list. */
const MANAGE_GROUPS: ManageMenuGroup[] = [
  {
    key: 'industry',
    label: 'Industry',
    icon: Factory,
    items: [
      { tab: 'indData', label: 'Records', icon: Database },
      { tab: 'indStats', label: 'Stats', icon: BarChart3 },
      { tab: 'attInd', label: 'Attendance', icon: Users },
    ],
  },
  {
    key: 'hotel',
    label: 'Hotel',
    icon: Building2,
    items: [
      { tab: 'hotelData', label: 'Records', icon: Database },
      { tab: 'hotelStats', label: 'Stats', icon: BarChart3 },
      { tab: 'attHotel', label: 'Attendance', icon: Users },
    ],
  },
  {
    key: 'health',
    label: 'Health',
    icon: Stethoscope,
    items: [
      { tab: 'healthData', label: 'Records', icon: Database },
      { tab: 'healthStats', label: 'Stats', icon: BarChart3 },
    ],
  },
  {
    key: 'education',
    label: 'Education',
    icon: GraduationCap,
    items: [
      { tab: 'eduData', label: 'Records', icon: Database },
      { tab: 'eduStats', label: 'Stats', icon: BarChart3 },
    ],
  },
  {
    key: 'agriculture',
    label: 'Agriculture',
    icon: Sprout,
    items: [
      { tab: 'agriData', label: 'Records', icon: Database },
      { tab: 'agriStats', label: 'Stats', icon: BarChart3 },
    ],
  },
  {
    key: 'administration',
    label: 'Administration',
    icon: Wrench,
    items: [
      { tab: 'meetings', label: 'Meetings', icon: Calendar },
      { tab: 'settings', label: 'Settings (Locations & Categories)', icon: Wrench },
      { tab: 'admin', label: 'Users', icon: Shield },
    ],
  },
];

const groupOf = (tab: string) =>
  MANAGE_GROUPS.find((g) => g.items.some((i) => i.tab === tab))?.key ?? '';

const MANAGE_TOOL_TABS = ['meetings', 'settings', 'admin'];

// Same pill styling as the module triggers in page.tsx
const pillClass =
  'flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-[11px] font-medium transition-all duration-200 sm:gap-2 sm:px-3.5 sm:py-2.5 sm:text-sm cursor-pointer select-none';
const pillActive = 'bg-teal-600 text-white shadow-md shadow-teal-600/30';
const pillIdle =
  'text-teal-900/70 hover:bg-teal-100/80 hover:text-teal-900';

interface ManageMenuProps {
  activeTab: string;
  onSelect: (tab: string) => void;
}

/** Shared vertical accordion — collapsible module groups, compact (no scroll needed).
 *  Remount (via key) re-expands the group containing the current tab. */
function ManageAccordion({ activeTab, onSelect }: ManageMenuProps) {
  const [openGroups, setOpenGroups] = React.useState<string[]>(() => {
    const g = groupOf(activeTab);
    return g ? [g] : [];
  });

  return (
    <Accordion
      type="multiple"
      value={openGroups}
      onValueChange={setOpenGroups}
      className="w-full"
    >
      {MANAGE_GROUPS.map((group) => {
        const GroupIcon = group.icon;
        const isGroupActive = groupOf(activeTab) === group.key;
        return (
          <AccordionItem key={group.key} value={group.key} className="rounded-xl border-b-0">
            <AccordionTrigger
              className={cn(
                'items-center gap-2 rounded-xl px-2 py-2 text-sm font-semibold no-underline transition-colors hover:bg-teal-50 hover:no-underline data-[state=open]:bg-teal-50/70 [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:translate-y-0 [&>svg]:text-teal-700',
                isGroupActive && 'bg-teal-50/70'
              )}
            >
              <span className="flex items-center gap-2">
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
                <span className="text-teal-900">{group.label}</span>
                <span className="rounded-full bg-teal-100/70 px-1.5 py-px text-[10px] font-medium text-teal-700">
                  {group.items.length}
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="pb-1.5 pt-0.5">
              <div className="space-y-0.5 pl-4">
                {group.items.map((item) => {
                  const ItemIcon = item.icon;
                  const isActive = activeTab === item.tab;
                  return (
                    <button
                      key={item.tab}
                      type="button"
                      onClick={() => onSelect(item.tab)}
                      className={cn(
                        'flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-[13px] transition-colors',
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

/** Slide-out drawer body — used by both the mobile hamburger and the pill on phones. */
function ManageSheetBody({ activeTab, onSelect, onClose }: ManageMenuProps & { onClose: () => void }) {
  return (
    <>
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
        <ManageAccordion
          activeTab={activeTab}
          onSelect={(tab) => {
            onSelect(tab);
            onClose();
          }}
        />
      </div>
    </>
  );
}

/** Desktop: compact vertical popover panel; phones: opens the slide-out drawer. */
export function ManageMenuDesktop({ activeTab, onSelect }: ManageMenuProps) {
  const [popOpen, setPopOpen] = React.useState(false);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  // Bumping this key on open remounts the accordion so the active group is expanded
  const [menuEpoch, setMenuEpoch] = React.useState(0);

  const openMenu = () => {
    setMenuEpoch((e) => e + 1);
    if (typeof window !== 'undefined' && window.innerWidth < 640) {
      setSheetOpen(true);
    } else {
      setPopOpen(true);
    }
  };

  return (
    <>
      <Popover open={popOpen} onOpenChange={setPopOpen}>
        <PopoverAnchor asChild>
          <button
            type="button"
            aria-expanded={popOpen}
            aria-haspopup="true"
            onClick={openMenu}
            className={cn(pillClass, MANAGE_TOOL_TABS.includes(activeTab) ? pillActive : pillIdle)}
          >
            <Wrench className="h-4 w-4" />
            <span>Manage</span>
            <ChevronDown className="h-3 w-3 opacity-60" />
          </button>
        </PopoverAnchor>
        <PopoverContent
          align="end"
          sideOffset={10}
          className="w-[300px] rounded-2xl border-teal-100 bg-white p-2 shadow-xl shadow-teal-900/10"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <p className="px-2 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-wider text-teal-900/40">
            Control center / Bulchiinsa
          </p>
          <ManageAccordion
            key={menuEpoch}
            activeTab={activeTab}
            onSelect={(tab) => {
              onSelect(tab);
              setPopOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="left" className="w-[290px] gap-0 p-0 sm:max-w-[290px]">
          <ManageSheetBody
            activeTab={activeTab}
            onSelect={onSelect}
            onClose={() => setSheetOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}

/** Mobile hamburger in the header — opens the vertical menu drawer. */
export function ManageMenuMobile({ activeTab, onSelect }: ManageMenuProps) {
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [menuEpoch, setMenuEpoch] = React.useState(0);

  return (
    <Sheet
      open={sheetOpen}
      onOpenChange={(open) => {
        setSheetOpen(open);
        if (open) setMenuEpoch((e) => e + 1);
      }}
    >
      <SheetTrigger asChild>
        <button
          type="button"
          title="Manage / Bulchiinsa"
          aria-label="Open manage menu"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-teal-900/70 transition-colors hover:bg-teal-100/80 hover:text-teal-900 sm:hidden"
        >
          <Menu className="h-4 w-4 sm:h-5 sm:w-5" />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[290px] gap-0 p-0 sm:max-w-[290px]">
        <ManageSheetBody
          key={menuEpoch}
          activeTab={activeTab}
          onSelect={onSelect}
          onClose={() => setSheetOpen(false)}
        />
      </SheetContent>
    </Sheet>
  );
}
