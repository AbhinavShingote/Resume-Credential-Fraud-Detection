/**
 * Admin page — user management + system monitoring.
 *
 * Access: role="admin" only (enforced by <Protected role="admin"> in App.jsx
 * and again by require_role("admin") on every backend endpoint).
 *
 * Two sections:
 *   1. System stats (counts + risk distribution + avg score)
 *   2. User management (list + change role + delete)
 *
 * Recent audit log is shown below for "who did what" visibility.
 */
import { useEffect, useState } from 'react';
import { Activity, Shield, Trash2, Users } from 'lucide-react';

import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

const C = {
  ink: '#1a1918',
  cream: '#faf7f0',
  parchment: '#f3ede0',
  border: '#e7e0cc',
  muted: '#6b6862',
  soft: '#ffffff',
  forest: '#14532d',
  amber: '#c2410c',
  crimson: '#991b1b',
  crimsonBg: '#fbeceb',
};

const F_DISP = "'Fraunces', Georgia, serif";
const F_MONO = "'IBM Plex Mono', monospace";

const ROLES = ['recruiter', 'admin', 'verification_staff'];


export default function Admin() {
  const { user: me } = useAuth();

  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadAll = () => {
    setLoading(true);
    setError('');
    Promise.all([
      api.get('/admin/stats'),
      api.get('/admin/users'),
      api.get('/admin/audit?limit=20'),
    ])
      .then(([s, u, a]) => {
        setStats(s);
        setUsers(u);
        setAudit(a);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(loadAll, []);

  const handleRoleChange = async (userId, role) => {
    try {
      await api.patch(`/admin/users/${userId}/role?role=${role}`);
      loadAll();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleDelete = async (userId, userName) => {
    if (!window.confirm(`Delete user "${userName}" and all their data? This cannot be undone.`)) {
      return;
    }
    try {
      await api.del(`/admin/users/${userId}`);
      loadAll();
    } catch (e) {
      setError(e.message);
    }
  };


  if (loading) {
    return (
      <div className="text-sm" style={{ color: C.muted, fontFamily: F_MONO }}>
        Loading admin data…
      </div>
    );
  }


  return (
    <div>
      {/* ============ Header ============ */}
      <div
        className="text-xs mb-2 flex items-center gap-2"
        style={{ fontFamily: F_MONO, color: C.muted, letterSpacing: '0.15em' }}
      >
        <Shield size={12} /> SYSTEM CONTROL
      </div>
      <h1 style={{ fontFamily: F_DISP, fontSize: 40, fontWeight: 500, color: C.ink }}>
        Administration
      </h1>

      {error && (
        <div
          className="mt-4 p-3 rounded-sm text-sm"
          style={{ background: C.crimsonBg, color: C.crimson }}
        >
          {error}
        </div>
      )}

      {/* ============ System stats ============ */}
      {stats && (
        <div
          className="grid grid-cols-4 gap-0 my-8"
          style={{ border: `1px solid ${C.border}`, background: C.soft }}
        >
          {[
            { label: 'Total users',    value: stats.total_users,   accent: C.ink },
            { label: 'Total resumes',  value: stats.total_resumes, accent: C.ink },
            { label: 'High-risk flags', value: stats.risk_distribution.high, accent: C.crimson },
            { label: 'Avg risk score', value: stats.avg_risk_score, accent: C.ink },
          ].map((s, i) => (
            <div
              key={i}
              className="p-5"
              style={{ borderRight: i < 3 ? `1px solid ${C.border}` : 'none' }}
            >
              <div
                className="text-xs mb-3"
                style={{ fontFamily: F_MONO, color: C.muted, letterSpacing: '0.1em' }}
              >
                {s.label.toUpperCase()}
              </div>
              <div
                style={{
                  fontFamily: F_DISP, fontSize: 40, color: s.accent, lineHeight: 1,
                }}
              >
                {s.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ============ User management ============ */}
      <SectionLabel num="01" icon={Users}>
        User management
      </SectionLabel>

      <div
        className="rounded-sm overflow-hidden mb-10"
        style={{ background: C.soft, border: `1px solid ${C.border}` }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {['Name', 'Email', 'Role', 'Joined', ''].map((h, i) => (
                <th
                  key={i}
                  className="text-left px-5 py-3 text-xs"
                  style={{
                    fontFamily: F_MONO, color: C.muted, fontWeight: 400,
                    letterSpacing: '0.1em',
                  }}
                >
                  {h.toUpperCase()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u, i) => (
              <tr
                key={u.id}
                style={{
                  borderBottom: i < users.length - 1 ? `1px solid ${C.border}` : 'none',
                }}
              >
                <td className="px-5 py-3" style={{ color: C.ink, fontWeight: 500 }}>
                  {u.name}
                  {u.id === me.id && (
                    <span
                      className="ml-2 text-xs px-1.5 py-0.5"
                      style={{
                        background: C.parchment, color: C.muted, fontFamily: F_MONO,
                      }}
                    >
                      you
                    </span>
                  )}
                </td>
                <td
                  className="px-5 py-3 text-xs"
                  style={{ color: C.muted, fontFamily: F_MONO }}
                >
                  {u.email}
                </td>
                <td className="px-5 py-3">
                  <select
                    value={u.role}
                    onChange={(e) => handleRoleChange(u.id, e.target.value)}
                    disabled={u.id === me.id}   // can't change your own role
                    className="px-2 py-1 text-xs outline-none rounded-sm"
                    style={{
                      background: C.parchment, color: C.ink,
                      border: `1px solid ${C.border}`, fontFamily: F_MONO,
                      letterSpacing: '0.05em',
                    }}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </td>
                <td
                  className="px-5 py-3 text-xs"
                  style={{ color: C.muted, fontFamily: F_MONO }}
                >
                  {new Date(u.created_at).toLocaleDateString('en-IN', {
                    day: '2-digit', month: 'short', year: 'numeric',
                  })}
                </td>
                <td className="px-5 py-3 text-right">
                  <button
                    onClick={() => handleDelete(u.id, u.name)}
                    disabled={u.id === me.id}   // can't delete yourself
                    title={u.id === me.id ? "Can't delete yourself" : 'Delete user'}
                    className="p-1.5 rounded-sm transition-colors"
                    style={{
                      color: u.id === me.id ? C.border : C.crimson,
                      cursor: u.id === me.id ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ============ Audit log ============ */}
      <SectionLabel num="02" icon={Activity}>
        Recent activity
      </SectionLabel>

      <div
        className="rounded-sm overflow-hidden"
        style={{ background: C.soft, border: `1px solid ${C.border}` }}
      >
        {audit.length === 0 ? (
          <div className="p-5 text-sm" style={{ color: C.muted }}>
            No activity logged yet.
          </div>
        ) : (
          audit.map((log, i) => (
            <div
              key={log.id}
              className="px-5 py-3 flex items-start gap-4 text-sm"
              style={{
                borderBottom: i < audit.length - 1 ? `1px solid ${C.border}` : 'none',
              }}
            >
              <div
                className="shrink-0 text-xs pt-0.5 w-32"
                style={{ color: C.muted, fontFamily: F_MONO }}
              >
                {new Date(log.created_at).toLocaleString('en-IN', {
                  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                })}
              </div>
              <div className="flex-1">
                <div style={{ color: C.ink }}>
                  <span
                    className="px-1.5 py-0.5 text-xs mr-2"
                    style={{
                      background: C.parchment, color: C.ink,
                      fontFamily: F_MONO, letterSpacing: '0.05em',
                    }}
                  >
                    {log.action.toUpperCase()}
                  </span>
                  <span style={{ fontFamily: F_MONO, fontSize: 12, color: C.muted }}>
                    user #{log.user_id ?? '—'}
                  </span>
                </div>
                {log.details && Object.keys(log.details).length > 0 && (
                  <pre
                    className="mt-1 text-xs whitespace-pre-wrap"
                    style={{ color: C.muted, fontFamily: F_MONO }}
                  >
                    {JSON.stringify(log.details, null, 0)}
                  </pre>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}


// ---------------- Sub-components ----------------

function SectionLabel({ num, icon: Icon, children }) {
  return (
    <div className="flex items-baseline gap-3 mb-4">
      <span
        style={{
          fontFamily: F_MONO, fontSize: 10, color: C.muted, letterSpacing: '0.15em',
        }}
      >
        § {num}
      </span>
      <h2
        className="flex items-center gap-2"
        style={{ fontFamily: F_DISP, fontSize: 22, color: C.ink, fontWeight: 500 }}
      >
        {Icon && <Icon size={16} strokeWidth={1.5} />}
        {children}
      </h2>
      <div
        className="flex-1 border-t border-dashed mt-3"
        style={{ borderColor: C.border }}
      />
    </div>
  );
}