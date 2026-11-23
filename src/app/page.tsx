'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  LogOut,
  Wifi,
  WifiOff,
  RefreshCw,
  CloudOff,
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
import EducationSurveyForm from '@/components/education/EducationSurveyForm';
import EducationList from '@/components/education/EducationList';
import EducationStats from '@/components/education/EducationStats';
import AgricultureSurveyForm from '@/components/agriculture/AgricultureSurveyForm';
import AgricultureList from '@/components/agriculture/AgricultureList';
import AgricultureStats from '@/components/agriculture/AgricultureStats';
import SettingsManager from '@/components/admin/SettingsManager';
import AnalyticsDashboard from '@/components/admin/AnalyticsDashboard';
import { AppSidebar, MobileSidebar } from '@/components/admin/ManageSidebar';
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

  if (status === 'loading') {
    return (
      <div className="app-canvas flex min-h-[100dvh] items-center justify-center">
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

  return (
    <SettingsProvider>
      <div className="app-canvas flex min-h-[100dvh]">
      {/* Desktop (lg+): left sidebar with the full vertical management list */}
      <AppSidebar
        activeTab={activeTab}
        onSelect={setActiveTab}
        isAdmin={isAdmin}
        userName={userName}
        isOnline={isOnline}
        pendingCount={pendingCount}
        isSyncing={isSyncing}
        onSync={() => syncPendingSurveys().then(() => setRefreshTrigger((t) => t + 1))}
      />

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
      {/* Header — mobile/tablet only; desktop navigation lives in the left sidebar */}
      <header className="sticky top-0 z-50 shrink-0 border-b bg-white shadow-sm safe-top lg:hidden">
        <div className="h-0.5 w-full bg-gradient-to-r from-teal-600 via-emerald-500 to-amber-400" />
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-2 px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <MobileSidebar activeTab={activeTab} onSelect={setActiveTab} isAdmin={isAdmin} />
            <img src="/icon.png" alt="Industry Survey" className="h-8 w-8 shrink-0 rounded-lg sm:h-10 sm:w-10 sm:rounded-xl" />
            <div className="min-w-0">
              <h1 className="truncate text-sm font-bold leading-tight sm:text-lg">
                Qorannoo <span className="text-brand-gradient">Dhibayyuu</span>
              </h1>
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

          {/* ============ Education module ============ */}
          <TabsContent value="eduSurvey" className="mt-2 sm:mt-3">
            <EducationSurveyForm
              onSubmit={handleSurveySubmit}
              surveyorName={userName || ''}
              surveyorId={userId || ''}
              isOnline={isOnline}
              onOfflineSave={(data) => saveOffline(data, 'education')}
            />
          </TabsContent>

          {isAdmin && (
            <TabsContent value="eduData" className="mt-2 sm:mt-3">
              <EducationList refreshTrigger={refreshTrigger} />
            </TabsContent>
          )}

          {isAdmin && (
            <TabsContent value="eduStats" className="mt-2 sm:mt-3">
              <EducationStats />
            </TabsContent>
          )}

          {/* ============ Agriculture module ============ */}
          <TabsContent value="agriSurvey" className="mt-2 sm:mt-3">
            <AgricultureSurveyForm
              onSubmit={handleSurveySubmit}
              surveyorName={userName || ''}
              surveyorId={userId || ''}
              isOnline={isOnline}
              onOfflineSave={(data) => saveOffline(data, 'agriculture')}
            />
          </TabsContent>

          {isAdmin && (
            <TabsContent value="agriData" className="mt-2 sm:mt-3">
              <AgricultureList refreshTrigger={refreshTrigger} />
            </TabsContent>
          )}

          {isAdmin && (
            <TabsContent value="agriStats" className="mt-2 sm:mt-3">
              <AgricultureStats />
            </TabsContent>
          )}

          {/* ============ Analytics — cross-module insights (admin) ============ */}
          {isAdmin && (
            <TabsContent value="analytics" className="mt-2 sm:mt-3">
              <AnalyticsDashboard />
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
      <footer className="fixed bottom-0 left-0 right-0 z-40 border-t bg-white safe-bottom lg:left-60">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-3 py-1.5 sm:px-4 sm:py-2 lg:max-w-5xl xl:max-w-7xl">
          <span className="truncate text-[10px] text-muted-foreground sm:text-xs">Dhibayyuu Sub-City Data Collection</span>
          <span className={`flex shrink-0 items-center gap-1 text-[10px] sm:text-xs ${isOnline ? 'text-teal-600' : 'text-amber-500'}`}>
            {isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {isOnline ? 'Online' : 'Offline'}
          </span>
        </div>
      </footer>
      </div>
      </div>
    </SettingsProvider>
  );
}
