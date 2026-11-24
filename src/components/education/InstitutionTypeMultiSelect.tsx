'use client';

import * as React from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

interface InstitutionTypeMultiSelectProps {
  /** Currently selected institution types */
  selected: string[];
  /** Called with the full updated list on every toggle / removal */
  onChange: (types: string[]) => void;
  /** All available institution types */
  options: string[];
  id?: string;
  className?: string;
}

/**
 * Multi-select combobox for institution types — an institution may operate at
 * several levels at once (e.g. Kindergarten + Primary School + Middle School).
 * Bilingual (English / Afaan Oromoo) labels.
 */
export function InstitutionTypeMultiSelect({
  selected,
  onChange,
  options,
  id,
  className,
}: InstitutionTypeMultiSelectProps) {
  const [open, setOpen] = React.useState(false);

  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((t) => t !== value) : [...selected, value]);
  };

  const triggerLabel =
    selected.length === 0
      ? 'Select one or more / Filadhu'
      : selected.length === 1
        ? selected[0]
        : `${selected.length} types selected`;

  return (
    <div className={cn('space-y-1.5', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              'h-10 w-full justify-between px-3 text-sm font-normal sm:text-base',
              selected.length === 0 && 'text-muted-foreground'
            )}
          >
            <span className="truncate">{triggerLabel}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-64 p-0" align="start">
          <Command>
            <CommandInput placeholder="Search type / Barbaaduu..." />
            <CommandList className="max-h-64">
              <CommandEmpty>No match / Hin argamne</CommandEmpty>
              <CommandGroup>
                {options.map((option) => {
                  const isSelected = selected.includes(option);
                  return (
                    <CommandItem key={option} value={option} onSelect={() => toggle(option)}>
                      <Checkbox checked={isSelected} className="mr-2 pointer-events-none" />
                      <span className="flex-1 text-sm">{option}</span>
                      {isSelected && <Check className="h-4 w-4 shrink-0 text-indigo-600" />}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((t) => (
            <Badge
              key={t}
              variant="outline"
              className="gap-1 bg-indigo-50 pr-1 text-[11px] font-normal text-indigo-700"
            >
              {t}
              <button
                type="button"
                aria-label={`Remove ${t}`}
                className="rounded-full p-0.5 transition-colors hover:bg-indigo-200"
                onClick={() => toggle(t)}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
