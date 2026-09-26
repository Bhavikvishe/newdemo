import { useEffect } from 'react';
import {
  useHashRoute,
  matchRoute,
  navigate,
} from './lib/router';
import { useStore } from './lib/store';
import { Shell } from './components/Shell';

import { LoginPage } from './pages/Login';
import { LandingPage } from './pages/Landing';
import { DashboardPage } from './pages/Dashboard';
import { DetectionPage } from './pages/Detection';
import { BatchPage } from './pages/Batch';
import { DepthAnalysisPage } from './pages/DepthAnalysis';
import { MapPage } from './pages/Map';
import { AlertsPage } from './pages/Alerts';
import { HistoryPage } from './pages/History';
import { SettingsPage } from './pages/Settings';
import { DepartmentsPage } from './pages/Departments';
import { MyDepartmentPage } from './pages/MyDepartment';
import { AdminPage } from './pages/Admin';
import { DetailPage } from './pages/Detail';

const PUBLIC_ROUTES = new Set([
  'login',
  'landing',
]);

function Page({
  page,
}: {
  page: string;
}) {
  switch (page) {
    case 'overview':
      return <DashboardPage />;

    case 'detection':
      return <DetectionPage />;

    case 'batch':
      return <BatchPage />;

    case 'depth':
      return <DepthAnalysisPage />;

    case 'map':
      return <MapPage />;

    case 'alerts':
      return <AlertsPage />;

    case 'history':
      return <HistoryPage />;

    case 'settings':
      return <SettingsPage />;

    case 'departments':
      return <DepartmentsPage />;

    case 'department':
      return <MyDepartmentPage />;

    case 'admin':
      return <AdminPage />;

    case 'detail':
      return <DetailPage />;

    default:
      return <DashboardPage />;
  }
}

export default function App() {
  const { user } = useStore();

  const route = useHashRoute();

  const { page } =
    matchRoute(route);

  const signedIn = !!user;

  useEffect(() => {
    if (
      !PUBLIC_ROUTES.has(page) &&
      !signedIn
    ) {
      navigate('login');
    } else if (
      page === 'login' &&
      signedIn
    ) {
      navigate('overview');
    }
  }, [page, signedIn]);

  if (page === 'landing') {
    return <LandingPage />;
  }

  if (!signedIn) {
    return <LoginPage />;
  }

  if (page === 'login') {
    return <LoginPage />;
  }

  const restricted =
    page === 'admin' &&
    user?.department !==
      'system-admin';

  return (
    <Shell route={route}>
      {restricted ? (
        <div
          className="card solid"
          style={{
            maxWidth: 560,
            margin: '8vh auto',
            padding: 32,
            textAlign: 'center',
          }}
        >
          <div
            className="tiny upper acc"
            style={{
              marginBottom: 8,
            }}
          >
            Privilege check
          </div>

          <h2
            style={{
              margin: '0 0 8px',
            }}
          >
            Administrator access
            required
          </h2>

          <p
            className="muted"
            style={{
              fontSize: 13.5,
              marginBottom: 20,
            }}
          >
            Task assignment is
            restricted to the
            System Administrator
            role. Sign in with a
            system-admin account
            to assign tasks to
            departments and
            members.
          </p>

          <button
            className="btn btn-primary"
            onClick={() =>
              navigate('overview')
            }
          >
            Back to overview
          </button>
        </div>
      ) : (
        <Page page={page} />
      )}
    </Shell>
  );
}