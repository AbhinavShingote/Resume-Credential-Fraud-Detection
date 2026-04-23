/**
 * Sidebar navigation rail.
 *
 * Rendered on every protected page by <Shell> in App.jsx.
 * Shows: logo, nav items, user card.
 *
 * Menu labels adapt based on role:
 *   - candidate → "My dashboard", "Analyze my resume", "My reports"
 *   - recruiter/admin → "Dashboard", "New analysis", "All reports"
 *   - admin also sees → "Administration"
 */
import {
  FileSearch, FileUp, LayoutDashboard, LogOut, Shield, Users,
} from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';

import { useAuth } from '../auth.jsx';

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const isCandidate = user?.role === 'candidate';

  // Build nav items dynamically based on role
  const items = [
    {
      to: '/',
      icon: LayoutDashboard,
      label: isCandidate ? 'My dashboard' : 'Dashboard',
    },
    {
      to: '/upload',
      icon: FileUp,
      label: isCandidate ? 'Analyze my resume' : 'New analysis',
    },
    {
      to: '/reports',
      icon: FileSearch,
      label: isCandidate ? 'My reports' : 'All reports',
    },
    ...(user?.role === 'admin'
      ? [{ to: '/admin', icon: Users, label: 'Administration' }]
      : []),
  ];

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <aside
      className="w-60 flex flex-col shrink-0"
      style={{ background: '#1a1918', color: '#faf7f0' }}
    >
      {/* --- Logo --- */}
      <div
        className="p-5 flex items-center gap-2"
        style={{ borderBottom: '1px solid rgba(250,247,240,0.1)' }}
      >
        <Shield size={18} strokeWidth={1.5} />
        <span style={{ fontFamily: "'Fraunces', serif", fontSize: 18 }}>
          VisiVerify
        </span>
      </div>

      {/* --- Nav items --- */}
      <nav className="p-3 flex-1 space-y-0.5">
        {items.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className="w-full px-3 py-2 text-left text-sm flex items-center gap-3 rounded-sm transition-all"
            style={({ isActive }) => ({
              background: isActive ? 'rgba(250,247,240,0.08)' : 'transparent',
              color: isActive ? '#faf7f0' : 'rgba(250,247,240,0.6)',
              fontFamily: "'DM Sans', sans-serif",
            })}
          >
            <Icon size={15} strokeWidth={1.5} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* --- User card + logout --- */}
      <div
        className="p-3"
        style={{ borderTop: '1px solid rgba(250,247,240,0.1)' }}
      >
        <div className="px-3 py-2 flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium"
            style={{ background: '#c2410c', fontFamily: "'IBM Plex Mono', monospace" }}
          >
            {user?.name?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs truncate">{user?.name ?? 'Guest'}</div>
            <div
              className="text-xs opacity-50"
              style={{ fontFamily: "'IBM Plex Mono', monospace" }}
            >
              {user?.role ?? ''}
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="opacity-60 hover:opacity-100 transition-opacity"
            title="Sign out"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}