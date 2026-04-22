/**
 * Root component. Three responsibilities:
 *
 *   1. Wrap everything in <AuthProvider> so any page can use useAuth()
 *   2. Define all the URL routes (/login, /, /upload, /reports, etc.)
 *   3. Guard protected routes: unauthenticated users bounce to /login,
 *      and non-admins can't reach /admin.
 */
import { Navigate, Route, Routes } from 'react-router-dom';

import { AuthProvider, useAuth } from './auth.jsx';

import Sidebar from './components/Sidebar.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Upload from './pages/Upload.jsx';
import Reports from './pages/Reports.jsx';
import Report from './pages/Report.jsx';
import Admin from './pages/Admin.jsx';


/**
 * Gate that requires the user to be logged in.
 * Optionally restricts to specific roles (e.g. role="admin").
 * Redirects to /login if not authenticated, to / if wrong role.
 */
function Protected({ children, role }) {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (role && user.role !== role) {
    return <Navigate to="/" replace />;
  }
  return children;
}


/**
 * Shell layout used by every protected page: sidebar on the left,
 * main content on the right. Dashboard/Upload/Reports/etc. render
 * into the <main> area.
 */
function Shell({ children }) {
  return (
    <div className="min-h-screen flex bg-cream text-ink">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="p-10 max-w-7xl">{children}</div>
      </main>
    </div>
  );
}


/**
 * The actual route table.
 */
function AppRoutes() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      {/* Public route */}
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/" replace /> : <Login />}
      />

      {/* Protected routes — all share the Shell layout */}
      <Route
        path="/"
        element={
          <Protected>
            <Shell><Dashboard /></Shell>
          </Protected>
        }
      />
      <Route
        path="/upload"
        element={
          <Protected>
            <Shell><Upload /></Shell>
          </Protected>
        }
      />
      <Route
        path="/reports"
        element={
          <Protected>
            <Shell><Reports /></Shell>
          </Protected>
        }
      />
      <Route
        path="/reports/:id"
        element={
          <Protected>
            <Shell><Report /></Shell>
          </Protected>
        }
      />

      {/* Admin-only route */}
      <Route
        path="/admin"
        element={
          <Protected role="admin">
            <Shell><Admin /></Shell>
          </Protected>
        }
      />

      {/* Fallback — anything unknown bounces home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}


export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}