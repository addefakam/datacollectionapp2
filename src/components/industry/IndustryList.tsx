'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import {
  Search,
  Download,
  Trash2,
  Eye,
  Factory,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  FileSpreadsheet,
  Pencil,
  Loader2,
  Save,
} from 'lucide-react';
import { locationData, getAllSubCities, getAreasForSubCity, SECTORS, OWNERSHIP_TYPES } from '@/lib/location-data';

interface Industry {
  id: string;
  establishmentName: string;
  sector: string;
  subCity: string;
  area: string;
  specificAddress: string;
  licenseNumber: string | null;
  ownershipType: string;
  employeeCount: number;
  startupCapital: number | null;
  contactName: string;
  contactPhone: string;
  surveyorName: string | null;
  createdAt: string;
  updatedAt: string;
}

interface EditForm {
  establishmentName: string;
  sector: string;
  subCity: string;
  area: string;
  specificAddress: string;
  licenseNumber: string;
  ownershipType: string;
  employeeCount: string;
  startupCapital: string;
  contactName: string;
  contactPhone: string;
}

interface IndustryListProps {
  refreshTrigger: number;
}

export default function IndustryList({ refreshTrigger }: IndustryListProps) {
  const { toast } = useToast();
  const [data, setData] = useState<Industry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterSubCity, setFilterSubCity] = useState('');
  const [filterArea, setFilterArea] = useState('');
  const [filterSector, setFilterSector] = useState('');
  const [areas, setAreas] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewItem, setViewItem] = useState<Industry | null>(null);
  const [editItem, setEditItem] = useState<Industry | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [editAreas, setEditAreas] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (filterSubCity) params.set('subCity', filterSubCity);
      if (filterArea) params.set('area', filterArea);
      if (filterSector) params.set('sector', filterSector);
      params.set('page', String(page));
      params.set('limit', '50');

      const res = await fetch(`/api/industries?${params}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      setData(json.data);
      setTotal(json.total);
      setTotalPages(json.totalPages);
    } catch {
      toast({ title: 'Error', description: 'Failed to load data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [search, filterSubCity, filterArea, filterSector, page, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshTrigger]);

  const handleSubCityFilterChange = (value: string) => {
    setFilterSubCity(value);
    setFilterArea('');
    setPage(1);
    setAreas(value ? getAreasForSubCity(value) : []);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/industries/${deleteId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      toast({ title: 'Deleted / Balleessame', description: 'Industry record deleted successfully' });
      fetchData();
    } catch {
      toast({ title: 'Error', description: 'Failed to delete record', variant: 'destructive' });
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  const openEdit = (item: Industry) => {
    setEditItem(item);
    setEditForm({
      establishmentName: item.establishmentName,
      sector: item.sector,
      subCity: item.subCity,
      area: item.area,
      specificAddress: item.specificAddress,
      licenseNumber: item.licenseNumber || '',
      ownershipType: item.ownershipType,
      employeeCount: String(item.employeeCount),
      startupCapital: item.startupCapital != null ? String(item.startupCapital) : '',
      contactName: item.contactName,
      contactPhone: item.contactPhone,
    });
    setEditAreas(getAreasForSubCity(item.subCity));
  };

  const handleSaveEdit = async () => {
    if (!editItem || !editForm) return;
    setSaving(true);
    try {
      const payload = {
        ...editForm,
        employeeCount: Number(editForm.employeeCount),
        startupCapital: editForm.startupCapital === '' ? null : Number(editForm.startupCapital),
      };
      const res = await fetch(`/api/industries/${editItem.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to save');
      }
      toast({ title: 'Saved / Nuusame', description: 'Record updated successfully' });
      setEditItem(null);
      setEditForm(null);
      fetchData();
    } catch (error) {
      toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to save', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async (format: 'csv' | 'excel') => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (filterSubCity) params.set('subCity', filterSubCity);
      if (filterArea) params.set('area', filterArea);
      if (filterSector) params.set('sector', filterSector);
      const res = await fetch(`/api/industries/export${format === 'excel' ? '/excel' : ''}?${params}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Export failed');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bishoftu_industry_survey_${new Date().toISOString().split('T')[0]}.${format === 'excel' ? 'xlsx' : 'csv'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast({ title: 'Export Successful', description: `Downloaded ${format.toUpperCase()} file` });
    } catch (error) {
      toast({ title: 'Export Failed', description: error instanceof Error ? error.message : 'Failed to export', variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      <Card>
        <CardHeader className="pb-2 sm:pb-3">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Factory className="h-5 w-5 text-teal-600" />
            Industry Records / Galmee Indastrii
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            {total} record{total !== 1 ? 's' : ''} collected
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2.5 sm:space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search name, address, license..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-9 text-sm sm:text-base"
            />
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-2">
            <Select value={filterSector || undefined} onValueChange={(v) => { setFilterSector(v === 'all' ? '' : v); setPage(1); }}>
              <SelectTrigger className="text-xs sm:text-sm"><SelectValue placeholder="All sectors" /></SelectTrigger>
              <SelectContent className="max-h-64">
                <SelectItem value="all">All sectors</SelectItem>
                {SECTORS.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
              </SelectContent>
            </Select>
            <Select value={filterSubCity || undefined} onValueChange={(v) => { handleSubCityFilterChange(v === 'all' ? '' : v); }}>
              <SelectTrigger className="text-xs sm:text-sm"><SelectValue placeholder="All sub-cities" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sub-cities</SelectItem>
                {getAllSubCities().map((sc) => (<SelectItem key={sc} value={sc}>{sc}</SelectItem>))}
              </SelectContent>
            </Select>
            <Select value={filterArea || undefined} onValueChange={(v) => { setFilterArea(v === 'all' ? '' : v); setPage(1); }} disabled={!filterSubCity}>
              <SelectTrigger className="text-xs sm:text-sm"><SelectValue placeholder={filterSubCity ? 'All woredas' : 'Select sub-city first'} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All woredas</SelectItem>
                {areas.map((a) => (<SelectItem key={a} value={a}>{a}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>

          {/* Export buttons */}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => handleExport('csv')} disabled={exporting} className="flex-1 text-xs sm:text-sm">
              <Download className="h-3.5 w-3.5" /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleExport('excel')} disabled={exporting} className="flex-1 text-xs sm:text-sm">
              <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
            </Button>
            <Button variant="outline" size="sm" onClick={fetchData} disabled={loading} className="shrink-0">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Records List */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : data.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Factory className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">No industry records found</p>
            <p className="mt-1 text-xs text-muted-foreground/70">Collect a survey or adjust your filters</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {data.map((item) => (
            <Card key={item.id} className="transition-shadow hover:shadow-md">
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Factory className="h-4 w-4 shrink-0 text-teal-600" />
                      <p className="truncate text-sm font-semibold sm:text-base">{item.establishmentName}</p>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground sm:text-xs">
                      <Badge variant="outline" className="bg-teal-50 text-[10px] text-teal-700">{item.sector}</Badge>
                      <span>{item.subCity} — {item.area}</span>
                      <span>•</span>
                      <span>{item.employeeCount} employees</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewItem(item)} title="View">
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(item)} title="Edit">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700" onClick={() => setDeleteId(item.id)} title="Delete">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            <ChevronLeft className="h-4 w-4" /> Prev
          </Button>
          <span className="text-xs text-muted-foreground">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* View Dialog */}
      <Dialog open={!!viewItem} onOpenChange={(open) => !open && setViewItem(null)}>
        <DialogContent className="max-h-[85dvh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Factory className="h-4 w-4 text-teal-600" />
              {viewItem?.establishmentName}
            </DialogTitle>
            <DialogDescription>{viewItem?.sector}</DialogDescription>
          </DialogHeader>
          {viewItem && (
            <div className="space-y-1 text-sm">
              {[
                ['Sector / Goossa', viewItem.sector],
                ['Sub-City / Kuttaa Maggalaa', viewItem.subCity],
                ['Werreda', viewItem.area],
                ['Specific Address', viewItem.specificAddress],
                ['License Number', viewItem.licenseNumber || '—'],
                ['Ownership Type', viewItem.ownershipType],
                ['Employee Count', String(viewItem.employeeCount)],
                ['Startup Capital (ETB)', viewItem.startupCapital != null ? viewItem.startupCapital.toLocaleString() : '—'],
                ['Contact Person', viewItem.contactName],
                ['Contact Phone', viewItem.contactPhone],
                ['Surveyor', viewItem.surveyorName || '—'],
                ['Collected On', new Date(viewItem.createdAt).toLocaleDateString('en-GB')],
              ].map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-3 border-b py-1.5 last:border-b-0">
                  <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
                  <span className="text-right text-sm font-medium">{value}</span>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editItem} onOpenChange={(open) => !open && setEditItem(null)}>
        <DialogContent className="max-h-[85dvh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Pencil className="h-4 w-4 text-teal-600" />
              Edit Industry Record
            </DialogTitle>
            <DialogDescription>Update establishment information</DialogDescription>
          </DialogHeader>
          {editForm && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="edit-name" className="text-xs">Establishment Name</Label>
                <Input id="edit-name" value={editForm.establishmentName} onChange={(e) => setEditForm({ ...editForm, establishmentName: e.target.value })} className="text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Sector</Label>
                <Select value={editForm.sector} onValueChange={(v) => setEditForm({ ...editForm, sector: v })}>
                  <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-64">{SECTORS.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Sub-City</Label>
                  <Select value={editForm.subCity} onValueChange={(v) => { setEditForm({ ...editForm, subCity: v, area: '' }); setEditAreas(getAreasForSubCity(v)); }}>
                    <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>{locationData.subCities.map((sc) => (<SelectItem key={sc.name} value={sc.name}>{sc.name}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Werreda</Label>
                  <Select value={editForm.area} onValueChange={(v) => setEditForm({ ...editForm, area: v })}>
                    <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>{editAreas.map((a) => (<SelectItem key={a} value={a}>{a}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-address" className="text-xs">Specific Address</Label>
                <Input id="edit-address" value={editForm.specificAddress} onChange={(e) => setEditForm({ ...editForm, specificAddress: e.target.value })} className="text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="edit-license" className="text-xs">License Number</Label>
                  <Input id="edit-license" value={editForm.licenseNumber} onChange={(e) => setEditForm({ ...editForm, licenseNumber: e.target.value })} className="text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Ownership Type</Label>
                  <Select value={editForm.ownershipType} onValueChange={(v) => setEditForm({ ...editForm, ownershipType: v })}>
                    <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>{OWNERSHIP_TYPES.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="edit-employees" className="text-xs">Employee Count</Label>
                  <Input id="edit-employees" type="number" min="0" value={editForm.employeeCount} onChange={(e) => setEditForm({ ...editForm, employeeCount: e.target.value })} className="text-sm" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit-capital" className="text-xs">Startup Capital (ETB)</Label>
                  <Input id="edit-capital" type="number" min="0" value={editForm.startupCapital} onChange={(e) => setEditForm({ ...editForm, startupCapital: e.target.value })} className="text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="edit-contact" className="text-xs">Contact Person</Label>
                  <Input id="edit-contact" value={editForm.contactName} onChange={(e) => setEditForm({ ...editForm, contactName: e.target.value })} className="text-sm" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit-phone" className="text-xs">Contact Phone</Label>
                  <Input id="edit-phone" value={editForm.contactPhone} onChange={(e) => setEditForm({ ...editForm, contactPhone: e.target.value })} className="text-sm" />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditItem(null)} size="sm">Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={saving} size="sm" className="bg-teal-600 hover:bg-teal-700">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Record?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this industry record. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-red-600 hover:bg-red-700">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
