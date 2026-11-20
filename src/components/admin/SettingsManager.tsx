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
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
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

const STATS_ATTRIBUTE_OPTIONS: { value: string; label: string; desc: string }[] = [
  { value: 'category', label: 'Category / Goossa', desc: 'Group industries by their sector (default)' },
  { value: 'woreda', label: 'Woreda / Werada', desc: 'Group industries by the woreda they are in' },
  { value: 'employees', label: 'Number of Employees / Lakkoofsa Hojjetaa', desc: 'Group industries by employee size ranges (0, 1–5, 6–10, …)' },
];

function StatsSection() {
  const { toast } = useToast();
  const [attribute, setAttribute] = useState('category');
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
        }
      } catch {
        // keep default
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings/stats-attribute', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attribute }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
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
          Choose what the Industry Stats &ldquo;Sector Distribution&rdquo; chart groups by by
          default. The chart can still be switched between category, woreda and employees at any
          time.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-teal-600" />
          </div>
        ) : (
          <RadioGroup value={attribute} onValueChange={setAttribute} className="gap-2">
            {STATS_ATTRIBUTE_OPTIONS.map((o) => (
              <label
                key={o.value}
                className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-colors ${
                  attribute === o.value
                    ? 'border-teal-500 bg-teal-50'
                    : 'hover:bg-muted/40'
                }`}
              >
                <RadioGroupItem value={o.value} className="mt-0.5" />
                <span>
                  <span className="block text-sm font-medium">{o.label}</span>
                  <span className="block text-xs text-muted-foreground">{o.desc}</span>
                </span>
              </label>
            ))}
          </RadioGroup>
        )}
        <Button onClick={save} disabled={saving || loading}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save / Olmaa
        </Button>
      </CardContent>
    </Card>
  );
}

// ============ Main component ============

export default function SettingsManager() {
  return (
    <div className="space-y-3">
      <Tabs defaultValue="locations">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="locations" className="gap-1.5">
            <MapPinned className="h-4 w-4" />
            <span className="text-[11px] sm:text-sm">Locations</span>
          </TabsTrigger>
          <TabsTrigger value="categories" className="gap-1.5">
            <Factory className="h-4 w-4" />
            <span className="text-[11px] sm:text-sm">Categories</span>
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
        <TabsContent value="stats" className="mt-3">
          <StatsSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
