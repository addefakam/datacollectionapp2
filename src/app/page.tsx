'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import {
  ClipboardList,
  BarChart3,
  Database,
  Shield,
  LogOut,
  Wifi,
  WifiOff,
  RefreshCw,
  CloudOff,
  Users,
  Calendar,
  Factory,
  Building2,
  Stethoscope,
  ChevronDown,
  Wrench,
} from 'lucide-react';
import { signOut } from 'next-auth/react';
import SurveyForm from '@/components/guesthouse/SurveyForm';
import DataList from '@/components/guesthouse/DataList';
import Dashboard from '@/components/guesthouse/Dashboard';
import LoginForm from '@/components/LoginForm';
import AdminPanel from '@/components/AdminPanel';
import MeetingManager from '@/components/guesthouse/MeetingManager';
import AttendanceDashboard from '@/components/guesthouse/AttendanceDashboard';
import CollectorAttendance from '@/components/guesthouse/CollectorAttendance';
import IndustrySurveyForm from '@/components/industry/IndustrySurveyForm';
import IndustryList from '@/components/industry/IndustryList';
import IndustryStats from '@/components/industry/IndustryStats';
import IndustryAttendance from '@/components/industry/IndustryAttendance';
import IndustryAttendanceDashboard from '@/components/industry/IndustryAttendanceDashboard';
import HealthSurveyForm from '@/components/health/HealthSurveyForm';
import HealthList from '@/components/health/HealthList';
import HealthStats from '@/components/health/HealthStats';
import SettingsManager from '@/components/admin/SettingsManager';
import { SettingsProvider } from '@/components/SettingsProvider';
import { useAuth } from '@/components/AuthProvider';
import { useOfflineSync } from '@/hooks/useOfflineSync';

export default function Home() {
  const { status } = useSession();
  const { isAdmin, userName, userId } = useAuth();
  const [activeTab, setActiveTab] = useState('survey');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const { isOnline, pendingCount, isSyncing, syncPendingSurveys, saveOffline } = useOfflineSync();

  const handleSurveySubmit = () => {
    setRefreshTrigger((t) => t + 1);
  };

  // Tab groups — used to highlight the owning dropdown trigger
  const industryTabs = ['survey', 'indData', 'indStats', 'attInd'];
  const hotelTabs = ['hotelSurvey', 'hotelData', 'hotelStats', 'attHotel'];
  const healthTabs = ['healthSurvey', 'healthData', 'healthStats'];
  const manageTabs = ['meetings', 'settings', 'admin'];

  if (status === 'loading') {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-teal-600 border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return <LoginForm />;
  }

  // Shared styles for dropdown triggers (styled like TabsTrigger)
  const dropTriggerClass = `flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-[11px] font-medium transition-all duration-200 sm:gap-2 sm:px-3.5 sm:py-2.5 sm:text-sm cursor-pointer select-none`;
  const dropTriggerActive = 'bg-teal-600 text-white shadow-md shadow-teal-600/30';
  const dropTriggerIdle = 'text-teal-900/70 hover:bg-teal-100/80 hover:text-teal-900 data-[state=open]:bg-teal-100 data-[state=open]:text-teal-900';

  return (
    <SettingsProvider>
      <div className="flex min-h-[100dvh] flex-col bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-50 shrink-0 border-b bg-white shadow-sm safe-top">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-2 px-3 py-2.5 sm:px-4 sm:py-3 lg:max-w-5xl xl:max-w-7xl">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <img src="/icon.png" alt="Industry Survey" className="h-8 w-8 shrink-0 rounded-lg sm:h-10 sm:w-10 sm:rounded-xl" />
            <div className="min-w-0">
              <h1 className="truncate text-sm font-bold leading-tight sm:text-lg">Qorannoo Indastrii Bishooftuu</h1>
              <p className="truncate text-[10px] text-muted-foreground sm:text-xs">
                {isAdmin ? 'Admin' : 'Data Collector'}: {userName}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {pendingCount > 0 && isOnline && (
              <Button
                variant="outline"
                size="sm"
                className="relative h-8 border-amber-400 px-2 text-amber-700 hover:bg-amber-50"
                onClick={() => syncPendingSurveys().then(() => setRefreshTrigger((t) => t + 1))}
                disabled={isSyncing}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span className="ml-1 text-xs font-semibold">{pendingCount}</span>
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 sm:h-9 sm:w-9"
              onClick={() => signOut({ callbackUrl: '/' })}
              title="Logout"
            >
              <LogOut className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Offline Banner */}
      {!isOnline && (
        <div className="flex shrink-0 items-center justify-center gap-1.5 bg-amber-500 px-3 py-1.5 text-center text-xs font-medium text-white sm:gap-2 sm:px-4 sm:py-2 sm:text-sm">
          <CloudOff className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
          <span className="truncate">Offline Mode / Offliin Jira</span>
          {pendingCount > 0 && (
            <span className="shrink-0 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] sm:px-2 sm:text-xs">
              {pendingCount} pending
            </span>
          )}
        </div>
      )}

      {/* Syncing Banner */}
      {isOnline && isSyncing && (
        <div className="flex shrink-0 items-center justify-center gap-1.5 bg-teal-500 px-3 py-1 sm:px-4 sm:py-1.5 sm:text-sm">
          <RefreshCw className="h-3.5 w-3.5 animate-spin shrink-0 sm:h-4 sm:w-4" />
          <span className="text-xs font-medium text-white sm:text-sm">Syncing... / Dhiheenyaa jira...</span>
        </div>
      )}

      {/* Main Content */}
      <main className="mx-auto w-full max-w-2xl flex-1 px-3 py-3 pb-20 sm:px-4 sm:py-4 sm:pb-24 lg:max-w-5xl xl:max-w-7xl">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className={`mb-3 w-full sm:mb-4 mx-auto max-w-2xl h-auto rounded-2xl border border-teal-100 bg-white p-1.5 shadow-sm shadow-teal-900/5 ${isAdmin ? 'grid grid-cols-4 gap-0.5 sm:gap-1' : 'grid grid-cols-3 gap-0.5 sm:gap-1'}`}>
            {/* Industry ▾ — all industry tabs live here */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={`${dropTriggerClass} ${industryTabs.includes(activeTab) ? dropTriggerActive : dropTriggerIdle}`}
                >
                  <Factory className="h-4 w-4" />
                  <span>Industry</span>
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                <DropdownMenuItem onClick={() => setActiveTab('survey')}>
                  <ClipboardList className="mr-2 h-4 w-4" /> Industry Survey
                </DropdownMenuItem>
                {isAdmin && (
                  <DropdownMenuItem onClick={() => setActiveTab('indData')}>
                    <Database className="mr-2 h-4 w-4" /> Industry Records
                  </DropdownMenuItem>
                )}
                {isAdmin && (
                  <DropdownMenuItem onClick={() => setActiveTab('indStats')}>
                    <BarChart3 className="mr-2 h-4 w-4" /> Industry Stats
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => setActiveTab('attInd')}>
                  <Users className="mr-2 h-4 w-4" /> Industry Attendance
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Hotel ▾ — all hotel tabs live here */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={`${dropTriggerClass} ${hotelTabs.includes(activeTab) ? dropTriggerActive : dropTriggerIdle}`}
                >
                  <Building2 className="h-4 w-4" />
                  <span>Hotel</span>
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                <DropdownMenuItem onClick={() => setActiveTab('hotelSurvey')}>
                  <ClipboardList className="mr-2 h-4 w-4" /> Hotel Survey
                </DropdownMenuItem>
                {isAdmin && (
                  <DropdownMenuItem onClick={() => setActiveTab('hotelData')}>
                    <Database className="mr-2 h-4 w-4" /> Hotel Records
                  </DropdownMenuItem>
                )}
                {isAdmin && (
                  <DropdownMenuItem onClick={() => setActiveTab('hotelStats')}>
                    <BarChart3 className="mr-2 h-4 w-4" /> Hotel Stats
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => setActiveTab('attHotel')}>
                  <Users className="mr-2 h-4 w-4" /> Hotel Attendance
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Health ▾ — all health facility tabs live here */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={`${dropTriggerClass} ${healthTabs.includes(activeTab) ? dropTriggerActive : dropTriggerIdle}`}
                >
                  <Stethoscope className="h-4 w-4" />
                  <span>Health</span>
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                <DropdownMenuItem onClick={() => setActiveTab('healthSurvey')}>
                  <ClipboardList className="mr-2 h-4 w-4" /> Health Survey
                </DropdownMenuItem>
                {isAdmin && (
                  <DropdownMenuItem onClick={() => setActiveTab('healthData')}>
                    <Database className="mr-2 h-4 w-4" /> Health Records
                  </DropdownMenuItem>
                )}
                {isAdmin && (
                  <DropdownMenuItem onClick={() => setActiveTab('healthStats')}>
                    <BarChart3 className="mr-2 h-4 w-4" /> Health Stats
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Manage ▾ — admin tools: meetings, settings, users */}
            {isAdmin && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={`${dropTriggerClass} ${manageTabs.includes(activeTab) ? dropTriggerActive : dropTriggerIdle}`}
                  >
                    <Wrench className="h-4 w-4" />
                    <span>Manage</span>
                    <ChevronDown className="h-3 w-3 opacity-60" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onClick={() => setActiveTab('meetings')}>
                    <Calendar className="mr-2 h-4 w-4" /> Meetings
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setActiveTab('settings')}>
                    <Wrench className="mr-2 h-4 w-4" /> Settings (Locations &amp; Categories)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setActiveTab('admin')}>
                    <Shield className="mr-2 h-4 w-4" /> Users
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </TabsList>

          {/* ============ Industry module ============ */}
          <TabsContent value="survey" className="mt-2 sm:mt-3">
            <IndustrySurveyForm
              onSubmit={handleSurveySubmit}
              surveyorName={userName || ''}
              surveyorId={userId || ''}
              isOnline={isOnline}
              onOfflineSave={(data) => saveOffline(data, 'industry')}
            />
          </TabsContent>

          {isAdmin && (
            <TabsContent value="indData" className="mt-2 sm:mt-3">
              <IndustryList refreshTrigger={refreshTrigger} />
            </TabsContent>
          )}

          {isAdmin && (
            <TabsContent value="indStats" className="mt-2 sm:mt-3">
              <IndustryStats />
            </TabsContent>
          )}

          {/* ============ Hotel module (legacy, under dropdown) ============ */}
          <TabsContent value="hotelSurvey" className="mt-2 sm:mt-3">
            <SurveyForm
              onSubmit={handleSurveySubmit}
              surveyorName={userName || ''}
              surveyorId={userId || ''}
              isOnline={isOnline}
              onOfflineSave={(data) => saveOffline(data, 'guesthouse')}
            />
          </TabsContent>

          {isAdmin && (
            <TabsContent value="hotelData" className="mt-2 sm:mt-3">
              <DataList refreshTrigger={refreshTrigger} />
            </TabsContent>
          )}

          {isAdmin && (
            <TabsContent value="hotelStats" className="mt-2 sm:mt-3">
              <Dashboard />
            </TabsContent>
          )}

          {/* ============ Health facility module ============ */}
          <TabsContent value="healthSurvey" className="mt-2 sm:mt-3">
            <HealthSurveyForm
              onSubmit={handleSurveySubmit}
              surveyorName={userName || ''}
              surveyorId={userId || ''}
              isOnline={isOnline}
              onOfflineSave={(data) => saveOffline(data, 'health')}
            />
          </TabsContent>

          {isAdmin && (
            <TabsContent value="healthData" className="mt-2 sm:mt-3">
              <HealthList refreshTrigger={refreshTrigger} />
            </TabsContent>
          )}

          {isAdmin && (
            <TabsContent value="healthStats" className="mt-2 sm:mt-3">
              <HealthStats />
            </TabsContent>
          )}

          {/* ============ Meetings (shared) ============ */}
          {isAdmin && (
            <TabsContent value="meetings" className="mt-2 sm:mt-3">
              <MeetingManager />
            </TabsContent>
          )}

          {/* ============ Settings — locations & categories (admin) ============ */}
          {isAdmin && (
            <TabsContent value="settings" className="mt-2 sm:mt-3">
              <SettingsManager />
            </TabsContent>
          )}

          {/* ============ Attendance module ============ */}
          <TabsContent value="attInd" className="mt-2 sm:mt-3">
            {isAdmin ? <IndustryAttendanceDashboard /> : <IndustryAttendance />}
          </TabsContent>

          <TabsContent value="attHotel" className="mt-2 sm:mt-3">
            {isAdmin ? <AttendanceDashboard /> : <CollectorAttendance />}
          </TabsContent>

          {/* ============ Users (admin) ============ */}
          {isAdmin && (
            <TabsContent value="admin" className="mt-2 sm:mt-3">
              <AdminPanel />
            </TabsContent>
          )}
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 z-40 border-t bg-white safe-bottom">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-3 py-1.5 sm:px-4 sm:py-2 lg:max-w-5xl xl:max-w-7xl">
          <span className="truncate text-[10px] text-muted-foreground sm:text-xs">Bishoftu Industry Data Collection</span>
          <span className={`flex shrink-0 items-center gap-1 text-[10px] sm:text-xs ${isOnline ? 'text-teal-600' : 'text-amber-500'}`}>
            {isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {isOnline ? 'Online' : 'Offline'}
          </span>
        </div>
      </footer>
      </div>
    </SettingsProvider>
  );
}
