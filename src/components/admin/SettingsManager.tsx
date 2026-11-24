'use client';

import { useEffect, useState } from 'react';
import {
  MapPin,
  Factory,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  X,
  MapPinned,
  BarChart3,
  ClipboardList,
  ChevronUp,
  ChevronDown,
  RotateCcw,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { useSettings, SubCityData } from '@/components/SettingsProvider';
import { STATS_ATTRIBUTES } from '@/lib/stats-attributes';
import { Switch } from '@/components/ui/switch';
import {
  INDUSTRY_SURVEY_FIELDS,
  SURVEY_FIELDS_DEFAULT,
  industrySurveyFieldDef,
  type IndustrySurveyFieldConfig,
} from '@/lib/industry-survey-fields';

// ============ Sub-Cities & Areas section ============

function SubCityEditDialog({
  subCity,
  onClose,
  onSaved,
}: {
  subCity: SubCityData | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(subCity?.name || '');
  const [areas, setAreas] = useState<string[]>(subCity?.areas || []);
  const [newArea, setNewArea] = useState('');
  const [saving, setSaving] = useState(false);

  const addArea = () => {
    const a = newArea.trim();
    if (!a) return;
    if (areas.some((x) => x.toLowerCase() === a.toLowerCase())) {
      toast({ title: 'Area already exists / Naannoon kun jira', variant: 'destructive' });
      return;
    }
    setAreas([...areas, a]);
    setNewArea('');
  };

  const removeArea = (a: string) => setAreas(areas.filter((x) => x !== a));

  const save = async () => {
    if (!name.trim()) {
      toast({ title: 'Name is required / Maqaa barbaachisa', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/sub-cities/${subCity!.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), areas }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      toast({ title: 'Sub-city updated / Fooyyee\'eera' });
      onSaved();
      onClose();
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : 'Failed to save',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Edit Sub-City / Kuttaa Maggalaa Sirreessuu</DialogTitle>
        <DialogDescription>
          Rename the sub-city and manage its woredas (areas).
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-1">
        <div className="space-y-1.5">
          <Label htmlFor="edit-sc-name">Sub-City Name / Maqaa Kuttaa *</Label>
          <Input
            id="edit-sc-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Dukam"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Woredas / Areas (Werada)</Label>
          <div className="flex gap-2">
            <Input
              value={newArea}
              onChange={(e) => setNewArea(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addArea();
                }
              }}
              placeholder="Add woreda / Werada dabaluu"
            />
            <Button type="button" size="sm" variant="outline" onClick={addArea}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {areas.length === 0 ? (
            <p className="text-xs text-muted-foreground">No areas yet.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {areas.map((a) => (
                <Badge key={a} variant="secondary" className="gap-1 pr-1">
                  {a}
                  <button
                    type="button"
                    onClick={() => removeArea(a)}
                    className="rounded-full p-0.5 hover:bg-muted-foreground/20"
                    aria-label={`Remove ${a}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save / Olmaa
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function SubCitiesSection() {
  const { subCities, reload, loading } = useSettings();
  const { toast } = useToast();
  const [newName, setNewName] = useState('');
  const [newAreas, setNewAreas] = useState('');
  const [adding, setAdding] = useState(false);
  const [editTarget, setEditTarget] = useState<SubCityData | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SubCityData | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Rows from the hardcoded fallback list carry fake ids ("default-N") that
  // don't exist in the database — editing them would always fail to save.
  // Refresh from the server first so the user edits a real row.
  const openEdit = (sc: SubCityData) => {
    if (sc.id.startsWith('default-')) {
      toast({
        title: 'Refreshing data… / Deetaa haaromsaa jira…',
        description: 'The sub-city list was not loaded from the server yet. Try Edit again in a moment.',
        variant: 'destructive',
      });
      reload();
      return;
    }
    setEditTarget(sc);
  };

  const add = async () => {
    if (!newName.trim()) {
      toast({ title: 'Name is required / Maqaa barbaachisa', variant: 'destructive' });
      return;
    }
    setAdding(true);
    try {
      const areas = newAreas
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean);
      const res = await fetch('/api/sub-cities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), areas }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add');
      toast({ title: 'Sub-city added / Kuttaa maggalaa dabalame' });
      setNewName('');
      setNewAreas('');
      await reload();
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : 'Failed to add',
        variant: 'destructive',
      });
    } finally {
      setAdding(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/sub-cities/${deleteTarget.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete');
      toast({ title: 'Sub-city deleted / Balleessera' });
      setDeleteTarget(null);
      await reload();
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : 'Failed to delete',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="h-4 w-4 text-teal-600" />
          Sub-Cities &amp; Woredas / Kututta Maggalaa fi Werada
        </CardTitle>
        <CardDescription>
          These lists appear in every survey form, filters and user assignments.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add form */}
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New sub-city / Kuttaa haaraa"
            />
            <Input
              value={newAreas}
              onChange={(e) => setNewAreas(e.target.value)}
              placeholder="Woredas, comma separated (optional)"
            />
          </div>
          <Button size="sm" onClick={add} disabled={adding}>
            {adding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Add Sub-City / Dabaluu
          </Button>
        </div>

        {/* List */}
        {loading ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Loading...</p>
        ) : (
          <div className="space-y-2">
            {subCities.map((sc) => (
              <div
                key={sc.id}
                className="flex items-center justify-between gap-2 rounded-lg border p-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{sc.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {sc.areas.length > 0 ? sc.areas.join(', ') : 'No woredas'}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => openEdit(sc)}
                    title="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={() => setDeleteTarget(sc)}
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            {subCities.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No sub-cities yet. Add the first one above.
              </p>
            )}
          </div>
        )}
      </CardContent>

      {editTarget && (
        <Dialog open onOpenChange={(open) => !open && setEditTarget(null)}>
          <SubCityEditDialog
            key={editTarget.id}
            subCity={editTarget}
            onClose={() => setEditTarget(null)}
            onSaved={reload}
          />
        </Dialog>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete sub-city?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.name} and its {deleteTarget?.areas.length} woreda(s) will be removed
              from the selection lists. Existing survey records keep their saved sub-city.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                remove();
              }}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleting}
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// ============ Industry Categories section ============

function CategoriesSection() {
  const { categories, reload, loading } = useSettings();
  const { toast } = useToast();
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [editTarget, setEditTarget] = useState<{ id: string; name: string } | null>(null);
  const [editName, setEditName] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const add = async () => {
    if (!newName.trim()) {
      toast({ title: 'Name is required / Maqaa barbaachisa', variant: 'destructive' });
      return;
    }
    setAdding(true);
    try {
      const res = await fetch('/api/industry-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add');
      toast({ title: 'Category added / Goossa dabalame' });
      setNewName('');
      await reload();
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : 'Failed to add',
        variant: 'destructive',
      });
    } finally {
      setAdding(false);
    }
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    if (!editName.trim()) {
      toast({ title: 'Name is required / Maqaa barbaachisa', variant: 'destructive' });
      return;
    }
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/industry-categories/${editTarget.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      toast({ title: 'Category updated / Fooyyee\'eera' });
      setEditTarget(null);
      await reload();
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : 'Failed to save',
        variant: 'destructive',
      });
    } finally {
      setSavingEdit(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/industry-categories/${deleteTarget.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete');
      toast({
        title:
          data.industriesAffected > 0
            ? `Deleted. ${data.industriesAffected} existing record(s) still keep this category.`
            : 'Category deleted / Balleessera',
      });
      setDeleteTarget(null);
      await reload();
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : 'Failed to delete',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Factory className="h-4 w-4 text-teal-600" />
          Industry Categories / Goossota Indastrii
        </CardTitle>
        <CardDescription>
          Sectors offered in the Industry Survey form and data filters.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add form */}
        <div className="flex gap-2 rounded-lg border bg-muted/30 p-3">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="New category / Goossa haaraa"
          />
          <Button size="sm" onClick={add} disabled={adding} className="shrink-0">
            {adding ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
            Add
          </Button>
        </div>

        {/* List */}
        {loading ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Loading...</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {categories.map((cat) => (
              <div
                key={cat.id}
                className="flex items-center justify-between gap-2 rounded-lg border p-2.5"
              >
                <p className="min-w-0 truncate text-sm">{cat.name}</p>
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => {
                      setEditTarget({ id: cat.id, name: cat.name });
                      setEditName(cat.name);
                    }}
                    title="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={() => setDeleteTarget({ id: cat.id, name: cat.name })}
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Edit dialog */}
      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Category / Goossa Sirreessuu</DialogTitle>
          </DialogHeader>
          <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)} disabled={savingEdit}>
              Cancel
            </Button>
            <Button onClick={saveEdit} disabled={savingEdit}>
              {savingEdit && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save / Olmaa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete category?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.name} will be removed from the selection lists. Existing survey
              records are not changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                remove();
              }}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleting}
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// ============ Sector Distribution attribution section ============

interface AttributeOption {
  key: string;
  label: string;
  description: string;
}

/** Registry fallback used when the settings request fails (offline etc.). */
const DEFAULT_ATTRIBUTE_OPTIONS: AttributeOption[] = STATS_ATTRIBUTES.map((a) => ({
  key: a.key,
  label: a.label,
  description: a.description,
}));

function StatsSection() {
  const { toast } = useToast();
  const [attribute, setAttribute] = useState('category');
  const [options, setOptions] = useState<AttributeOption[]>([]);
  const [newKey, setNewKey] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/settings/stats-attribute');
        if (res.ok && !cancelled) {
          const data = await res.json();
          setAttribute(data.attribute);
          if (Array.isArray(data.options) && data.options.length > 0) {
            setOptions(data.options);
          }
        }
      } catch {
        // offline — fall back to the registry defaults below
      } finally {
        if (!cancelled) {
          setOptions((cur) => (cur.length > 0 ? cur : DEFAULT_ATTRIBUTE_OPTIONS));
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Registry keys not yet enabled — these can be added. */
  const addable = STATS_ATTRIBUTES.filter((a) => !options.some((o) => o.key === a.key));

  const addOption = () => {
    const def = STATS_ATTRIBUTES.find((a) => a.key === newKey);
    if (!def) return;
    setOptions([
      ...options,
      { key: def.key, label: newLabel.trim() || def.label, description: def.description },
    ]);
    setNewKey('');
    setNewLabel('');
  };

  const removeOption = (key: string) => {
    const next = options.filter((o) => o.key !== key);
    if (next.length === 0) return; // keep at least one option
    setOptions(next);
    if (attribute === key) setAttribute(next[0].key);
  };

  const save = async () => {
    setSaving(true);
    try {
      const optRes = await fetch('/api/settings/stats-attribute-options', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          options: options
            .map(({ key, label }) => ({ key, label: label.trim() }))
            .filter((o) => o.label),
        }),
      });
      const optData = await optRes.json();
      if (!optRes.ok) throw new Error(optData.error || 'Failed to save options');

      const attrRes = await fetch('/api/settings/stats-attribute', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attribute }),
      });
      const attrData = await attrRes.json();
      if (!attrRes.ok) throw new Error(attrData.error || 'Failed to save default');
      toast({ title: 'Stats attribution saved / Qoodaan olmaa' });
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : 'Failed to save',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-4 w-4 text-teal-600" />
          Sector Distribution Attribution / Qooda Goossa
        </CardTitle>
        <CardDescription>
          Manage what the Industry Stats &ldquo;Sector Distribution&rdquo; chart can group by:
          rename options, add new ones, remove unneeded ones, and pick the default. The chart can
          still be switched between the enabled options at any time.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-teal-600" />
          </div>
        ) : (
          <>
            {/* Enabled options — rename inline or remove */}
            <div className="space-y-2">
              <Label>Attribution options / Filannoo Qooda Goossa</Label>
              <div className="space-y-2">
                {options.map((o) => (
                  <div key={o.key} className="flex items-center gap-2">
                    <Input
                      value={o.label}
                      onChange={(e) =>
                        setOptions(
                          options.map((x) => (x.key === o.key ? { ...x, label: e.target.value } : x))
                        )
                      }
                      className="h-9 flex-1"
                      aria-label={`Label for ${o.key}`}
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-9 w-9 shrink-0 text-red-600 hover:bg-red-50 hover:text-red-700"
                      onClick={() => removeOption(o.key)}
                      disabled={options.length <= 1}
                      aria-label={`Remove ${o.label}`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Add a new attribute from the registry */}
            {addable.length > 0 ? (
              <div className="space-y-2">
                <Label>Add attribute / Qooda dabaluu</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Select value={newKey} onValueChange={setNewKey}>
                    <SelectTrigger className="h-9 sm:w-56">
                      <SelectValue placeholder="Choose / Filadhu" />
                    </SelectTrigger>
                    <SelectContent>
                      {addable.map((a) => (
                        <SelectItem key={a.key} value={a.key}>
                          {a.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder={
                      STATS_ATTRIBUTES.find((a) => a.key === newKey)?.label ||
                      'Custom label (optional) / Maqaa'
                    }
                    className="h-9 flex-1"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={addOption}
                    disabled={!newKey}
                    className="gap-1"
                  >
                    <Plus className="h-4 w-4" />
                    Add / Dabaluu
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                All available attributes are in use / Filannoo hunduu kan fayyadamaa jiru
              </p>
            )}

            {/* Default grouping among enabled options */}
            <div className="space-y-2">
              <Label>Default grouping / Qooda durtii</Label>
              <RadioGroup value={attribute} onValueChange={setAttribute} className="gap-2">
                {options.map((o) => (
                  <label
                    key={o.key}
                    className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-colors ${
                      attribute === o.key ? 'border-teal-500 bg-teal-50' : 'hover:bg-muted/40'
                    }`}
                  >
                    <RadioGroupItem value={o.key} className="mt-0.5" />
                    <span>
                      <span className="block text-sm font-medium">{o.label}</span>
                      <span className="block text-xs text-muted-foreground">{o.description}</span>
                    </span>
                  </label>
                ))}
              </RadioGroup>
            </div>
          </>
        )}
        <Button onClick={save} disabled={saving || loading}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save / Olmaa
        </Button>
      </CardContent>
    </Card>
  );
}

// ============ Industry survey questionnaire section ============

/** Wizard steps of the survey form — questions are managed per step. */
const SURVEY_STEP_TITLES: Record<number, string> = {
  1: 'Step 1 — Establishment / Indastrii',
  2: 'Step 2 — Registration / Galmee fi Safiisaa',
  3: 'Step 3 — Contact / Quunnamtii',
};

function SurveySection() {
  const { toast } = useToast();
  const [fields, setFields] = useState<IndustrySurveyFieldConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/settings/survey-fields');
        if (res.ok && !cancelled) {
          const data = await res.json();
          if (Array.isArray(data.fields) && data.fields.length > 0) {
            setFields(data.fields);
            return;
          }
        }
      } catch {
        // offline — fall back to the registry defaults below
      } finally {
        if (!cancelled) setLoading(false);
      }
      if (!cancelled) setFields(SURVEY_FIELDS_DEFAULT.map((f) => ({ ...f })));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const def = (key: string) => industrySurveyFieldDef(key);

  /** Move a question up/down within its own wizard step. */
  const move = (key: string, dir: -1 | 1) => {
    const idx = fields.findIndex((f) => f.key === key);
    const step = def(key)?.step;
    if (idx < 0 || step == null) return;
    // positions of this step's questions inside the flat array
    const stepIdxs = fields
      .map((f, i) => (def(f.key)?.step === step ? i : -1))
      .filter((i) => i >= 0);
    const pos = stepIdxs.indexOf(idx);
    const targetPos = pos + dir;
    if (targetPos < 0 || targetPos >= stepIdxs.length) return;
    const target = stepIdxs[targetPos];
    const next = [...fields];
    [next[idx], next[target]] = [next[target], next[idx]];
    setFields(next);
  };

  const update = (key: string, patch: Partial<IndustrySurveyFieldConfig>) => {
    setFields((cur) => cur.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  };

  const toggleEnabled = (key: string, enabled: boolean) => {
    const d = def(key);
    update(key, enabled ? { enabled: true } : { enabled: false, required: false });
    // Hiding a yes/no question silently stores "no" — warn once.
    if (!enabled && d?.input === 'radio-yesno') {
      toast({
        title: 'Question hidden / Gaaffii dhokatee',
        description: 'Hidden yes/no questions are stored as "No" for new records / Gaaffii dhokame "Lakki" jedhamuun galmeefama',
      });
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings/survey-fields', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      if (Array.isArray(data.fields)) setFields(data.fields);
      toast({ title: 'Saved / Olmaa', description: 'Survey questionnaire updated — the form follows it immediately' });
    } catch (e) {
      toast({
        title: 'Save Failed / Hin Olmaa’ne',
        description: e instanceof Error ? e.message : 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings/survey-fields', { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to reset');
      if (Array.isArray(data.fields)) setFields(data.fields);
      toast({ title: 'Reset / Deebii', description: 'Questionnaire restored to the default questions' });
    } catch (e) {
      toast({
        title: 'Reset Failed / Hin Deebi’ne',
        description: e instanceof Error ? e.message : 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-teal-600" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardList className="h-4 w-4 text-teal-600" />
          Survey Questions / Gaaffii Safiisaa
        </CardTitle>
        <CardDescription className="text-xs">
          Manage the Industry survey questionnaire: hide questions, change required flags, edit
          labels and reorder them inside their step. Core identification questions (name, sector,
          location, employee count, contact) cannot be removed. The survey form, its validation and
          the server follow this questionnaire immediately.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {[1, 2, 3].map((step) => {
          const stepFields = fields.filter((f) => def(f.key)?.step === step);
          return (
            <div key={step} className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {SURVEY_STEP_TITLES[step]}
              </p>
              <div className="overflow-hidden rounded-lg border">
                {stepFields.map((f, i) => {
                  const d = def(f.key)!;
                  const requiredLockable = !d.requiredFixed && f.enabled && d.input !== 'radio-yesno';
                  return (
                    <div
                      key={f.key}
                      data-field-key={f.key}
                      className={`flex flex-col gap-2 p-2.5 sm:flex-row sm:items-center ${i > 0 ? 'border-t' : ''} ${f.enabled ? '' : 'bg-muted/40'}`}
                    >
                      {/* Order controls */}
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          onClick={() => move(f.key, -1)}
                          disabled={i === 0}
                          className="rounded border p-1 text-muted-foreground disabled:opacity-30 hover:bg-teal-50 hover:text-teal-700"
                          title="Move up"
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => move(f.key, 1)}
                          disabled={i === stepFields.length - 1}
                          className="rounded border p-1 text-muted-foreground disabled:opacity-30 hover:bg-teal-50 hover:text-teal-700"
                          title="Move down"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {/* Labels */}
                      <div className="min-w-0 flex-1 space-y-1">
                        <Input
                          value={f.labelEn}
                          onChange={(e) => update(f.key, { labelEn: e.target.value })}
                          className="h-8 text-xs sm:text-sm"
                          placeholder={d.labelEn}
                        />
                        <Input
                          value={f.labelOr}
                          onChange={(e) => update(f.key, { labelOr: e.target.value })}
                          className="h-7 border-dashed text-[11px] text-muted-foreground sm:text-xs"
                          placeholder={d.labelOr}
                        />
                      </div>
                      {/* Flags */}
                      <div className="flex shrink-0 items-center gap-3 sm:gap-4">
                        {d.locked ? (
                          <Badge className="bg-teal-100 text-[10px] text-teal-700">Core</Badge>
                        ) : (
                          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <Switch
                              checked={f.enabled}
                              onCheckedChange={(v) => toggleEnabled(f.key, v)}
                              className="data-[state=checked]:bg-teal-600"
                            />
                            Shown
                          </label>
                        )}
                        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Switch
                            checked={f.required}
                            disabled={!requiredLockable}
                            onCheckedChange={(v) => update(f.key, { required: v })}
                            className="data-[state=checked]:bg-amber-500"
                          />
                          Required
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save / Olmaa
          </Button>
          <Button variant="outline" onClick={reset} disabled={saving}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset to Default / Deebi’a
          </Button>
          <p className="text-[10px] text-muted-foreground">
            Hidden questions store empty values for new records / Gaaffii dhokame duwwaa galmeefama
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ============ Main component ============

export default function SettingsManager() {
  return (
    <div className="space-y-3">
      <Tabs defaultValue="locations">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="locations" className="gap-1.5">
            <MapPinned className="h-4 w-4" />
            <span className="text-[11px] sm:text-sm">Locations</span>
          </TabsTrigger>
          <TabsTrigger value="categories" className="gap-1.5">
            <Factory className="h-4 w-4" />
            <span className="text-[11px] sm:text-sm">Categories</span>
          </TabsTrigger>
          <TabsTrigger value="survey" className="gap-1.5">
            <ClipboardList className="h-4 w-4" />
            <span className="text-[11px] sm:text-sm">Survey</span>
          </TabsTrigger>
          <TabsTrigger value="stats" className="gap-1.5">
            <BarChart3 className="h-4 w-4" />
            <span className="text-[11px] sm:text-sm">Stats</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="locations" className="mt-3">
          <SubCitiesSection />
        </TabsContent>
        <TabsContent value="categories" className="mt-3">
          <CategoriesSection />
        </TabsContent>
        <TabsContent value="survey" className="mt-3">
          <SurveySection />
        </TabsContent>
        <TabsContent value="stats" className="mt-3">
          <StatsSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
