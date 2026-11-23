'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
  GraduationCap,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  FileSpreadsheet,
  Pencil,
  Loader2,
  Save,
  Upload,
  Phone,
  MapPin,
  FileBadge,
  Check,
  X,
  BookOpen,
  FlaskConical,
  Monitor,
  Utensils,
} from 'lucide-react';
import { EDUCATION_INSTITUTION_TYPES, EDUCATION_OWNERSHIP_TYPES, splitInstitutionTypes } from '@/lib/location-data';
import { hasSexBreakdown } from '@/lib/sex-counts';
import { useSettings } from '@/components/SettingsProvider';
import { InstitutionTypeMultiSelect } from './InstitutionTypeMultiSelect';

interface EducationCenter {
  id: string;
  institutionName: string;
  institutionType: string;
  ownershipType: string;
  subCity: string;
  area: string;
  specificAddress: string;
  licenseNumber: string | null;
  studentCount: number;
  maleStudents: number;
  femaleStudents: number;
  teacherCount: number;
  maleTeachers: number;
  femaleTeachers: number;
  classroomCount: number;
  hasLibrary: boolean;
  hasLaboratory: boolean;
  hasComputerLab: boolean;
  hasFeedingProgram: boolean;
  contactName: string;
  contactPhone: string;
  surveyorName: string | null;
  surveyorId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface EditForm {
  institutionName: string;
  institutionType: string;
  ownershipType: string;
  subCity: string;
  area: string;
  specificAddress: string;
  licenseNumber: string;
  studentCount: string;
  maleStudents: string;
  femaleStudents: string;
  teacherCount: string;
  maleTeachers: string;
  femaleTeachers: string;
  classroomCount: string;
  hasLibrary: string;
  hasLaboratory: string;
  hasComputerLab: string;
  hasFeedingProgram: string;
  contactName: string;
  contactPhone: string;
}

interface DataListProps {
  refreshTrigger: number;
}

const PAGE_SIZE = 50;

const SERVICE_FIELDS: { name: string; label: string }[] = [
  { name: 'hasLibrary', label: 'Library' },
  { name: 'hasLaboratory', label: 'Laboratory' },
  { name: 'hasComputerLab', label: 'Computer Lab' },
  { name: 'hasFeedingProgram', label: 'Feeding Program' },
];

function fmtDate(value: string): string {
  const d = new Date(value);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB');
}

export default function EducationList({ refreshTrigger }: DataListProps) {
  const { subCities, areasFor } = useSettings();
  const { toast } = useToast();
  const [data, setData] = useState<EducationCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterSubCity, setFilterSubCity] = useState('');
  const [filterArea, setFilterArea] = useState('');
  const [filterType, setFilterType] = useState('');
  const [areas, setAreas] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewItem, setViewItem] = useState<EducationCenter | null>(null);
  const [editItem, setEditItem] = useState<EducationCenter | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [editAreas, setEditAreas] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importResult, setImportResult] = useState<{success: number, failed: number, errors: string[]} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (filterSubCity) params.set('subCity', filterSubCity);
      if (filterArea) params.set('area', filterArea);
      if (filterType) params.set('institutionType', filterType);
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));

      const res = await fetch(`/api/educationcenters?${params}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      setData(json.data);
      setTotal(json.total);
      setTotalPages(json.totalPages);
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to load data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [search, filterSubCity, filterArea, filterType, page, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshTrigger]);

  const handleSubCityFilterChange = (value: string) => {
    setFilterSubCity(value);
    setFilterArea('');
    setPage(1);
    setAreas(value ? areasFor(value) : []);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/educationcenters/${deleteId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Delete failed');
      toast({ title: 'Record Deleted / Balleessera', description: 'Record removed successfully.' });
      fetchData();
    } catch {
      toast({
        title: 'Delete Failed',
        description: 'Could not delete the record.',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  const openEdit = (item: EducationCenter) => {
    setEditItem(item);
    setEditForm({
      institutionName: item.institutionName,
      institutionType: item.institutionType,
      ownershipType: item.ownershipType,
      subCity: item.subCity,
      area: item.area,
      specificAddress: item.specificAddress,
      licenseNumber: item.licenseNumber || '',
      studentCount: String(item.studentCount),
      maleStudents: String(item.maleStudents || ''),
      femaleStudents: String(item.femaleStudents || ''),
      teacherCount: String(item.teacherCount),
      maleTeachers: String(item.maleTeachers || ''),
      femaleTeachers: String(item.femaleTeachers || ''),
      classroomCount: String(item.classroomCount),
      hasLibrary: item.hasLibrary ? 'yes' : 'no',
      hasLaboratory: item.hasLaboratory ? 'yes' : 'no',
      hasComputerLab: item.hasComputerLab ? 'yes' : 'no',
      hasFeedingProgram: item.hasFeedingProgram ? 'yes' : 'no',
      contactName: item.contactName,
      contactPhone: item.contactPhone,
    });
    setEditAreas(areasFor(item.subCity));
  };

  const handleEditSubCityChange = (value: string) => {
    if (!editForm) return;
    setEditAreas(areasFor(value));
    setEditForm({ ...editForm, subCity: value, area: '' });
  };

  const handleSave = async () => {
    if (!editItem || !editForm) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/educationcenters/${editItem.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Update failed');
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
      if (filterType) params.set('institutionType', filterType);
      const res = await fetch(`/api/educationcenters/export${format === 'excel' ? '/excel' : ''}?${params}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Export failed');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bishoftu_education_survey_${new Date().toISOString().split('T')[0]}.${format === 'excel' ? 'xlsx' : 'csv'}`;
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

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/educationcenters/import', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Import failed');
      setImportResult(json);
      toast({ title: 'Galmeessaa Keessaa / Import Complete', description: json.message });
      fetchData();
    } catch (error) {
      toast({ title: 'Import Failed', description: error instanceof Error ? error.message : 'Check file format', variant: 'destructive' });
    } finally { setImporting(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const actionButtons = (item: EducationCenter) => (
    <>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewItem(item)} title="View">
        <Eye className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(item)} title="Edit">
        <Pencil className="h-3.5 w-3.5 text-blue-600" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => setDeleteId(item.id)} title="Delete">
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </>
  );

  const serviceChips = (item: EducationCenter, size: 'sm' | 'lg' = 'sm') => {
    const svc = [
      { ok: item.hasLibrary, short: 'Lib', icon: BookOpen },
      { ok: item.hasLaboratory, short: 'Lab', icon: FlaskConical },
      { ok: item.hasComputerLab, short: 'ICT', icon: Monitor },
      { ok: item.hasFeedingProgram, short: 'Feed', icon: Utensils },
    ];
    const cls = size === 'sm'
      ? 'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold'
      : 'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold';
    return svc.map((s) => (
      <span key={s.short} className={`${cls} ${s.ok ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'}`}>
        {s.ok ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />} {s.short}
      </span>
    ));
  };

  const startIndex = (page - 1) * PAGE_SIZE;

  return (
    <div className="space-y-3 sm:space-y-4">
      <Card>
        <CardHeader className="pb-2 sm:pb-3">
          <CardTitle className="flex items-center justify-between gap-2 text-base sm:text-lg">
            <span className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-indigo-600" />
              Education Records / Galmee Mana Barumsaa
            </span>
            <Badge variant="secondary" className="shrink-0 bg-indigo-100 text-indigo-700 text-xs sm:text-sm">
              {total} record{total !== 1 ? 's' : ''}
            </Badge>
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">View and manage all collected education institution survey data</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2.5 sm:space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search name, address, license, contact..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-9 text-sm sm:text-base"
            />
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-2">
            <Select value={filterType || undefined} onValueChange={(v) => { setFilterType(v === 'all' ? '' : v); setPage(1); }}>
              <SelectTrigger className="text-xs sm:text-sm"><SelectValue placeholder="All institution types" /></SelectTrigger>
              <SelectContent className="max-h-64">
                <SelectItem value="all">All institution types</SelectItem>
                {EDUCATION_INSTITUTION_TYPES.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
              </SelectContent>
            </Select>
            <Select value={filterSubCity || undefined} onValueChange={(v) => { handleSubCityFilterChange(v === 'all' ? '' : v); }}>
              <SelectTrigger className="text-xs sm:text-sm"><SelectValue placeholder="All sub-cities" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sub-cities</SelectItem>
                {subCities.map((sc) => (<SelectItem key={sc.name} value={sc.name}>{sc.name}</SelectItem>))}
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

          {/* Export / Import buttons */}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => handleExport('csv')} disabled={exporting} className="flex-1 text-xs sm:text-sm">
              <Download className="h-3.5 w-3.5" /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleExport('excel')} disabled={exporting} className="flex-1 text-xs sm:text-sm">
              <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowImport(true)} className="flex-1 text-xs sm:text-sm">
              <Upload className="h-3.5 w-3.5" /> Import
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
            <GraduationCap className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">No education institution records found</p>
            <p className="mt-1 text-xs text-muted-foreground/70">Collect a survey, import Excel, or adjust your filters</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Desktop: full data table */}
          <Card className="hidden md:block overflow-hidden">
            <CardContent className="px-0 py-0">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-gradient-to-r from-slate-50 via-indigo-50/60 to-slate-50">
                    <th className="w-10 px-2.5 py-2 text-center font-semibold text-[10px] uppercase tracking-wider text-indigo-900/60">#</th>
                    <th className="px-2.5 py-2 text-left font-semibold text-[10px] uppercase tracking-wider text-indigo-900/60">Institution</th>
                    <th className="px-2.5 py-2 text-left font-semibold text-[10px] uppercase tracking-wider text-indigo-900/60">Type</th>
                    <th className="px-2.5 py-2 text-left font-semibold text-[10px] uppercase tracking-wider text-indigo-900/60">Sub-City</th>
                    <th className="px-2.5 py-2 text-left font-semibold text-[10px] uppercase tracking-wider text-indigo-900/60">Werreda</th>
                    <th className="px-2.5 py-2 text-left font-semibold text-[10px] uppercase tracking-wider text-indigo-900/60">License No</th>
                    <th className="px-2.5 py-2 text-left font-semibold text-[10px] uppercase tracking-wider text-indigo-900/60">Ownership</th>
                    <th className="px-2.5 py-2 text-left font-semibold text-[10px] uppercase tracking-wider text-indigo-900/60">Services</th>
                    <th className="px-2.5 py-2 text-center font-semibold text-[10px] uppercase tracking-wider text-indigo-900/60">Students</th>
                    <th className="px-2.5 py-2 text-center font-semibold text-[10px] uppercase tracking-wider text-indigo-900/60">Teachers</th>
                    <th className="px-2.5 py-2 text-center font-semibold text-[10px] uppercase tracking-wider text-indigo-900/60">Classrooms</th>
                    <th className="px-2.5 py-2 text-left font-semibold text-[10px] uppercase tracking-wider text-indigo-900/60">Contact</th>
                    <th className="px-2.5 py-2 text-left font-semibold text-[10px] uppercase tracking-wider text-indigo-900/60">Surveyor</th>
                    <th className="px-2.5 py-2 text-left font-semibold text-[10px] uppercase tracking-wider text-indigo-900/60">Collected</th>
                    <th className="px-2.5 py-2 text-center font-semibold text-[10px] uppercase tracking-wider text-indigo-900/60">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((item, i) => (
                    <tr key={item.id} className="border-b last:border-b-0 hover:bg-indigo-50/40 transition-colors">
                      <td className="px-2.5 py-2 text-center text-muted-foreground/70">{startIndex + i + 1}</td>
                      <td className="max-w-[200px] px-2.5 py-2">
                        <p className="truncate font-semibold text-foreground" title={item.institutionName}>{item.institutionName}</p>
                        <p className="truncate text-[10px] text-muted-foreground" title={item.specificAddress}>
                          <span className="inline-flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" />{item.specificAddress}</span>
                        </p>
                      </td>
                      <td className="max-w-[130px] px-2.5 py-2">
                        <Badge variant="outline" className="max-w-full truncate bg-indigo-50 text-[10px] font-normal text-indigo-700" title={item.institutionType}>{item.institutionType}</Badge>
                      </td>
                      <td className="whitespace-nowrap px-2.5 py-2">{item.subCity}</td>
                      <td className="whitespace-nowrap px-2.5 py-2">{item.area}</td>
                      <td className="whitespace-nowrap px-2.5 py-2 font-mono text-[11px] text-muted-foreground">{item.licenseNumber || '—'}</td>
                      <td className="max-w-[110px] truncate px-2.5 py-2 text-muted-foreground" title={item.ownershipType}>{item.ownershipType}</td>
                      <td className="whitespace-nowrap px-2.5 py-2">
                        <div className="flex items-center gap-1">{serviceChips(item)}</div>
                      </td>
                      <td className="px-2.5 py-2 text-center">
                        <span className="inline-flex h-6 min-w-[28px] items-center justify-center rounded-full bg-indigo-100 px-1.5 text-xs font-semibold text-indigo-700">{item.studentCount}</span>
                        {hasSexBreakdown(item.maleStudents, item.femaleStudents) && (
                          <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground"><span className="font-medium text-sky-600">M {item.maleStudents}</span> · <span className="font-medium text-pink-600">F {item.femaleStudents}</span></p>
                        )}
                      </td>
                      <td className="px-2.5 py-2 text-center">
                        <span className="inline-flex h-6 min-w-[28px] items-center justify-center rounded-full bg-violet-100 px-1.5 text-xs font-semibold text-violet-700">{item.teacherCount}</span>
                        {hasSexBreakdown(item.maleTeachers, item.femaleTeachers) && (
                          <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground"><span className="font-medium text-sky-600">M {item.maleTeachers}</span> · <span className="font-medium text-pink-600">F {item.femaleTeachers}</span></p>
                        )}
                      </td>
                      <td className="px-2.5 py-2 text-center">
                        <span className="inline-flex h-6 min-w-[28px] items-center justify-center rounded-full bg-amber-100 px-1.5 text-xs font-semibold text-amber-700">{item.classroomCount}</span>
                      </td>
                      <td className="whitespace-nowrap px-2.5 py-2">
                        <p className="max-w-[110px] truncate font-medium" title={item.contactName}>{item.contactName}</p>
                        <a href={`tel:${item.contactPhone}`} className="text-[11px] font-medium text-indigo-600 hover:underline">{item.contactPhone}</a>
                      </td>
                      <td className="max-w-[90px] truncate px-2.5 py-2 text-muted-foreground" title={item.surveyorName || undefined}>{item.surveyorName || '—'}</td>
                      <td className="whitespace-nowrap px-2.5 py-2 text-muted-foreground">{fmtDate(item.createdAt)}</td>
                      <td className="px-2.5 py-2">
                        <div className="flex justify-center gap-0.5">{actionButtons(item)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Mobile: enriched record cards */}
          <div className="space-y-2 md:hidden">
            {data.map((item, i) => (
              <Card key={item.id} className="overflow-hidden border-indigo-100/80 transition-shadow hover:shadow-md">
                {/* slim gradient top edge */}
                <div className="h-1 bg-gradient-to-r from-indigo-500 via-cyan-400 to-indigo-500" />
                <CardContent className="p-3 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-md bg-indigo-100 px-1 text-[10px] font-bold text-indigo-700">{startIndex + i + 1}</span>
                        <p className="truncate text-sm font-semibold">{item.institutionName}</p>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                        {splitInstitutionTypes(item.institutionType).map((t) => (
                          <Badge key={t} variant="outline" className="bg-indigo-50 text-[10px] text-indigo-700">{t}</Badge>
                        ))}
                        <span className="inline-flex items-center gap-0.5"><MapPin className="h-3 w-3" />{item.subCity} — {item.area}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-0.5">{actionButtons(item)}</div>
                  </div>

                  {/* Stat tiles */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-lg bg-indigo-50 px-2 py-1.5 text-center">
                      <p className="text-[9px] text-indigo-600">Barataa</p>
                      <p className="text-sm font-bold text-indigo-700">{item.studentCount}</p>
                      {hasSexBreakdown(item.maleStudents, item.femaleStudents) && (
                        <p className="text-[9px] leading-tight"><span className="font-medium text-sky-600">M {item.maleStudents}</span> · <span className="font-medium text-pink-600">F {item.femaleStudents}</span></p>
                      )}
                    </div>
                    <div className="rounded-lg bg-violet-50 px-2 py-1.5 text-center">
                      <p className="text-[9px] text-violet-600">Barsiisaa</p>
                      <p className="text-sm font-bold text-violet-700">{item.teacherCount}</p>
                      {hasSexBreakdown(item.maleTeachers, item.femaleTeachers) && (
                        <p className="text-[9px] leading-tight"><span className="font-medium text-sky-600">M {item.maleTeachers}</span> · <span className="font-medium text-pink-600">F {item.femaleTeachers}</span></p>
                      )}
                    </div>
                    <div className="rounded-lg bg-amber-50 px-2 py-1.5 text-center">
                      <p className="text-[9px] text-amber-600">Abbaa Qabuu</p>
                      <p className="truncate text-[11px] font-semibold text-amber-700 leading-tight mt-0.5" title={item.ownershipType}>{item.ownershipType}</p>
                    </div>
                  </div>

                  {/* License + services */}
                  <div className="flex items-center justify-between gap-2 border-t pt-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <FileBadge className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                      <p className="truncate font-mono text-[11px] text-muted-foreground">{item.licenseNumber || '—'}</p>
                    </div>
                    <div className="flex shrink-0 gap-1">{serviceChips(item)}</div>
                  </div>

                  {/* Contact row */}
                  <div className="flex items-center justify-between gap-2 border-t pt-2">
                    <div className="min-w-0">
                      <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Contact</p>
                      <p className="truncate text-[11px] font-medium">{item.contactName}</p>
                    </div>
                    <a href={`tel:${item.contactPhone}`} className="inline-flex shrink-0 items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] font-medium text-indigo-700 active:bg-indigo-100">
                      <Phone className="h-3 w-3" /> {item.contactPhone}
                    </a>
                  </div>

                  <p className="text-[10px] text-muted-foreground/60 text-right">
                    {item.surveyorName && <span>{item.surveyorName} &middot; </span>}
                    {fmtDate(item.createdAt)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">Fuula / Page {page} of {totalPages}</span>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Record?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this education institution record. This action cannot be undone.
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

      {/* View Dialog */}
      <Dialog open={!!viewItem} onOpenChange={(open) => !open && setViewItem(null)}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg p-0 gap-0">
          {viewItem && (
            <>
              {/* Gradient header with watermark */}
              <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-indigo-700 to-blue-700 px-5 pt-6 pb-5 rounded-t-lg">
                <GraduationCap className="absolute -right-3 -top-4 h-28 w-28 rotate-12 text-white/10" />
                <GraduationCap className="absolute right-16 top-8 h-14 w-14 -rotate-6 text-white/10" />
                <DialogHeader>
                  <DialogTitle className="pr-8 text-lg font-bold text-white leading-tight">{viewItem.institutionName}</DialogTitle>
                  <DialogDescription className="mt-1.5 flex flex-wrap items-center gap-1.5 text-indigo-50 text-xs">
                    <span className="rounded-full bg-white/15 px-2 py-0.5 backdrop-blur-sm">{viewItem.institutionType}</span>
                    <span className="rounded-full bg-white/15 px-2 py-0.5 backdrop-blur-sm">{viewItem.ownershipType}</span>
                    <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{viewItem.area} &middot; {viewItem.subCity}</span>
                  </DialogDescription>
                </DialogHeader>
              </div>

              <div className="px-5 py-4 space-y-4">
                {/* Stat tiles */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-2.5 text-center">
                    <p className="text-[10px] font-medium text-indigo-600">Barataa / Students</p>
                    <p className="mt-0.5 text-xl font-bold text-indigo-700">{viewItem.studentCount}</p>
                    {hasSexBreakdown(viewItem.maleStudents, viewItem.femaleStudents) ? (
                      <p className="mt-0.5 text-[11px] font-medium"><span className="text-sky-600">Male {viewItem.maleStudents}</span> · <span className="text-pink-600">Female {viewItem.femaleStudents}</span></p>
                    ) : (
                      <p className="mt-0.5 text-[10px] text-muted-foreground">Sex not recorded</p>
                    )}
                  </div>
                  <div className="rounded-xl border border-violet-100 bg-violet-50 p-2.5 text-center">
                    <p className="text-[10px] font-medium text-violet-600">Barsiisaa / Teachers</p>
                    <p className="mt-0.5 text-xl font-bold text-violet-700">{viewItem.teacherCount}</p>
                    {hasSexBreakdown(viewItem.maleTeachers, viewItem.femaleTeachers) ? (
                      <p className="mt-0.5 text-[11px] font-medium"><span className="text-sky-600">Male {viewItem.maleTeachers}</span> · <span className="text-pink-600">Female {viewItem.femaleTeachers}</span></p>
                    ) : (
                      <p className="mt-0.5 text-[10px] text-muted-foreground">Sex not recorded</p>
                    )}
                  </div>
                  <div className="rounded-xl border border-blue-100 bg-blue-50 p-2.5 text-center">
                    <p className="text-[10px] font-medium text-blue-600">Classrooms</p>
                    <p className="mt-0.5 text-xl font-bold text-blue-700">{viewItem.classroomCount}</p>
                  </div>
                  <div className="rounded-xl border border-green-100 bg-green-50 p-2.5 text-center">
                    <p className="text-[10px] font-medium text-green-600">Tajaajila / Services</p>
                    <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1">{serviceChips(viewItem, 'lg')}</div>
                  </div>
                </div>

                {/* License */}
                <div className="flex items-center gap-2.5 rounded-lg border bg-muted/40 p-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
                    <FileBadge className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-medium text-muted-foreground">Lakofsaa Eyyeema / License No.</p>
                    <p className="truncate font-mono text-sm font-semibold">{viewItem.licenseNumber || '—'}</p>
                  </div>
                </div>

                {/* Address */}
                <div>
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <div className="h-1 w-1 rounded-full bg-indigo-500" />
                    <h4 className="text-xs font-bold uppercase tracking-wide text-indigo-700">Baka Addaa / Address</h4>
                  </div>
                  <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-sm leading-relaxed text-foreground/80">{viewItem.specificAddress}</p>
                </div>

                {/* Services detail */}
                <div>
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <div className="h-1 w-1 rounded-full bg-green-500" />
                    <h4 className="text-xs font-bold uppercase tracking-wide text-green-700">Tajaajila / Services</h4>
                  </div>
                  <div className="rounded-lg border space-y-0 divide-y">
                    {[
                      { ok: viewItem.hasLibrary, icon: BookOpen, label: 'Library — library or reading room' },
                      { ok: viewItem.hasLaboratory, icon: FlaskConical, label: 'Laboratory — science laboratory' },
                      { ok: viewItem.hasComputerLab, icon: Monitor, label: 'Computer Lab — computer or ICT lab' },
                      { ok: viewItem.hasFeedingProgram, icon: Utensils, label: 'Feeding Program — school meals program' },
                    ].map((svc) => (
                      <div key={svc.label} className="flex items-center justify-between px-3 py-2.5">
                        <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                          <svc.icon className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
                          <span className="truncate">{svc.label}</span>
                        </span>
                        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${svc.ok ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                          {svc.ok ? <><Check className="h-3 w-3" /> Yes / Eyee</> : <><X className="h-3 w-3" /> No / Lakki</>}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Contact */}
                <div>
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <div className="h-1 w-1 rounded-full bg-blue-500" />
                    <h4 className="text-xs font-bold uppercase tracking-wide text-blue-700">Odeeffannoo Quunnamtii / Contact</h4>
                  </div>
                  <div className="rounded-lg border space-y-0 divide-y">
                    <div className="flex items-center justify-between px-3 py-2.5">
                      <span className="text-xs text-muted-foreground">Nama Quunnamtu / Contact Person</span>
                      <span className="text-sm font-semibold">{viewItem.contactName}</span>
                    </div>
                    <div className="flex items-center justify-between px-3 py-2.5">
                      <span className="text-xs text-muted-foreground">Bilbila / Phone</span>
                      <a href={`tel:${viewItem.contactPhone}`} className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:underline">
                        <Phone className="h-3 w-3" />{viewItem.contactPhone}
                      </a>
                    </div>
                  </div>
                </div>

                {/* Footer / Surveyor */}
                <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2.5">
                  <span className="text-[10px] text-muted-foreground">Sakatta&#39;aa / Surveyor</span>
                  <span className="text-xs font-medium">{viewItem.surveyorName || '—'}</span>
                  <span className="text-[10px] text-muted-foreground">{fmtDate(viewItem.createdAt)}</span>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editItem} onOpenChange={(open) => !open && setEditItem(null)}>
        <DialogContent className="max-h-[85dvh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Pencil className="h-4 w-4 text-blue-600" />
              Edit Education Record
            </DialogTitle>
            <DialogDescription>Update education institution information</DialogDescription>
          </DialogHeader>
          {editForm && (
            <div className="space-y-4 pt-2">
              {/* Institution */}
              <div className="space-y-3 rounded-lg border p-3">
                <h4 className="flex items-center gap-1.5 text-sm font-semibold text-indigo-700">
                  <GraduationCap className="h-3.5 w-3.5" /> Odeeffannoo Mana Barumsaa / Institution
                </h4>
                <div className="space-y-2">
                  <Label className="text-xs">Institution Name / Maqaa Mana Barumsaa <span className="text-red-500">*</span></Label>
                  <Input value={editForm.institutionName} onChange={(e) => setEditForm({ ...editForm, institutionName: e.target.value })} className="text-sm" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Institution Type / Gosa <span className="text-red-500">*</span></Label>
                  <InstitutionTypeMultiSelect
                    selected={splitInstitutionTypes(editForm.institutionType)}
                    onChange={(types) => setEditForm({ ...editForm, institutionType: types.join(', ') })}
                    options={EDUCATION_INSTITUTION_TYPES}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs">Sub-City / Kututtaa Maggalaa <span className="text-red-500">*</span></Label>
                    <Select value={editForm.subCity} onValueChange={(v) => { setEditForm({ ...editForm, subCity: v, area: '' }); handleEditSubCityChange(v); }}>
                      <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>{subCities.map((sc) => (<SelectItem key={sc.name} value={sc.name}>{sc.name}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Werreda <span className="text-red-500">*</span></Label>
                    <Select value={editForm.area} onValueChange={(v) => setEditForm({ ...editForm, area: v })}>
                      <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>{editAreas.map((a) => (<SelectItem key={a} value={a}>{a}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Specific Address / Baka Addaa <span className="text-red-500">*</span></Label>
                  <Input value={editForm.specificAddress} onChange={(e) => setEditForm({ ...editForm, specificAddress: e.target.value })} className="text-sm" />
                </div>
              </div>

              {/* Registration & capacity */}
              <div className="space-y-3 rounded-lg border p-3">
                <h4 className="flex items-center gap-1.5 text-sm font-semibold text-blue-700">
                  <FileBadge className="h-3.5 w-3.5" /> Galmee fi Dandeettii / Registration &amp; Capacity
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs">License Number</Label>
                    <Input value={editForm.licenseNumber} onChange={(e) => setEditForm({ ...editForm, licenseNumber: e.target.value })} className="text-sm" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Ownership Type <span className="text-red-500">*</span></Label>
                    <Select value={editForm.ownershipType} onValueChange={(v) => setEditForm({ ...editForm, ownershipType: v })}>
                      <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>{EDUCATION_OWNERSHIP_TYPES.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs">Student Count <span className="text-red-500">*</span></Label>
                    <Input type="number" min="0" value={editForm.studentCount} onChange={(e) => setEditForm({ ...editForm, studentCount: e.target.value })} className="text-sm" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Teacher Count <span className="text-red-500">*</span></Label>
                    <Input type="number" min="0" value={editForm.teacherCount} onChange={(e) => setEditForm({ ...editForm, teacherCount: e.target.value })} className="text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs">Male Students</Label>
                    <Input type="number" min="0" value={editForm.maleStudents} onChange={(e) => setEditForm({ ...editForm, maleStudents: e.target.value })} className="text-sm" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Female Students</Label>
                    <Input type="number" min="0" value={editForm.femaleStudents} onChange={(e) => setEditForm({ ...editForm, femaleStudents: e.target.value })} className="text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs">Male Teachers</Label>
                    <Input type="number" min="0" value={editForm.maleTeachers} onChange={(e) => setEditForm({ ...editForm, maleTeachers: e.target.value })} className="text-sm" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Female Teachers</Label>
                    <Input type="number" min="0" value={editForm.femaleTeachers} onChange={(e) => setEditForm({ ...editForm, femaleTeachers: e.target.value })} className="text-sm" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Classroom Count <span className="text-red-500">*</span></Label>
                  <Input type="number" min="0" value={editForm.classroomCount} onChange={(e) => setEditForm({ ...editForm, classroomCount: e.target.value })} className="text-sm" />
                </div>
              </div>

              {/* Services */}
              <div className="space-y-3 rounded-lg border p-3">
                <h4 className="flex items-center gap-1.5 text-sm font-semibold text-green-700">
                  <BookOpen className="h-3.5 w-3.5" /> Tajaajila / Services
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  {SERVICE_FIELDS.map((svc) => (
                    <div key={svc.name} className="space-y-2">
                      <Label className="text-xs">{svc.label}</Label>
                      <Select value={editForm[svc.name as keyof EditForm]} onValueChange={(v) => setEditForm({ ...editForm, [svc.name]: v })}>
                        <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="yes">Yes / Eyee</SelectItem>
                          <SelectItem value="no">No / Lakki</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Contact */}
              <div className="space-y-3 rounded-lg border p-3">
                <h4 className="flex items-center gap-1.5 text-sm font-semibold text-purple-700">
                  <Phone className="h-3.5 w-3.5" /> Quunnamtii / Contact
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs">Contact Person <span className="text-red-500">*</span></Label>
                    <Input value={editForm.contactName} onChange={(e) => setEditForm({ ...editForm, contactName: e.target.value })} className="text-sm" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Contact Phone <span className="text-red-500">*</span></Label>
                    <Input type="tel" value={editForm.contactPhone} onChange={(e) => setEditForm({ ...editForm, contactPhone: e.target.value })} className="text-sm" />
                  </div>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEditItem(null)} size="sm">Cancel</Button>
            <Button onClick={handleSave} disabled={saving} size="sm" className="bg-indigo-600 hover:bg-indigo-700">
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Import Dialog */}
      <Dialog open={showImport} onOpenChange={(open) => { setShowImport(open); if (!open) setImportResult(null); }}>
        <DialogContent className="max-w-[95vw] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-indigo-600" />
              <span>Galmeessaa Keessaa / Bulk Import</span>
            </DialogTitle>
            <DialogDescription>Import education institution records from Excel file</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="rounded-lg border border-dashed border-indigo-300 bg-indigo-50/50 p-6 text-center">
              <Upload className="mx-auto h-10 w-10 text-indigo-400" />
              <p className="mt-2 text-sm font-medium">Fiilii Excel Dabali / Drop Excel File</p>
              <p className="mt-1 text-xs text-muted-foreground">.xlsx files only</p>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
              <Button variant="outline" size="sm" className="mt-3" onClick={() => fileInputRef.current?.click()} disabled={importing}>
                {importing ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Importing...</> : <><Upload className="mr-1 h-4 w-4" /> Select File</>}
              </Button>
            </div>
            <Button variant="outline" size="sm" className="w-full" onClick={() => window.open('/api/educationcenters/import/template', '_blank')}>
              <Download className="mr-1 h-4 w-4" /> Download Template / Daawwii Mallatteessaa
            </Button>
            {importResult && (
              <div className={`rounded-lg border p-3 ${importResult.failed === 0 ? 'border-indigo-200 bg-indigo-50' : 'border-amber-200 bg-amber-50'}`}>
                <p className="text-sm font-semibold">
                  <span className="text-indigo-700">{importResult.success} succeeded</span>
                  {importResult.failed > 0 && <span className="text-red-600 ml-2">{importResult.failed} failed</span>}
                </p>
                {importResult.errors.length > 0 && (
                  <div className="mt-2 max-h-24 overflow-y-auto">
                    {importResult.errors.slice(0, 10).map((err, i) => (
                      <p key={i} className="text-xs text-red-600">{err}</p>
                    ))}
                    {importResult.errors.length > 10 && <p className="text-xs text-muted-foreground">...and {importResult.errors.length - 10} more</p>}
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
