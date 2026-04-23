/**
 * Dashboard — the landing page after login.
 *
 * Fetches two endpoints in parallel:
 *   GET /reports/stats  → top stat cards (total, high, medium, low, avg)
 *   GET /reports/       → recent submissions table
 *
 * Heading and copy adapt based on user role:
 *   - candidate → friendly "Hello, [name]" + self-check messaging
 *   - recruiter/admin → professional "Overview" + case file tone
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Plus } from 'lucide-react';
import {
  Cell, Pie, PieChart, ResponsiveContainer, Tooltip,
} from 'recharts';

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
  forestBg: '#ecf4ee',
  amber: '#c2410c',
  amberBg: '#fdf0e6',
  crimson: '#991b1b',
  crimsonBg: '#fbeceb',
};

const F_DISP = "'Fraunces', Georgia, serif";
const F_MONO = "'IBM Plex Mono', monospace";

const riskColor = (level) => ({
  low: { fg: C.forest, bg: C.forestBg, label: 'LOW' },
  medium: { fg: C.amber, bg: C.amberBg, label: 'MED' },
  high: { fg: C.crimson, bg: C.crimsonBg, label: 'HIGH' },
}[level] || { fg: C.muted, bg: C.parchment, label: level?.toUpperCase() });

const decisionPill = (d) => ({
  pending: { fg: C.amber, bg: C.amberBg, t: 'Pending review' },
  approved: { fg: C.forest, bg: C.forestBg, t: 'Approved' },
  rejected: { fg: C.crimson, bg: C.crimsonBg, t: 'Rejected' },
}[d] || { fg: C.muted, bg: C.parchment, t: d || '—' });

const formatWhen = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffHrs = (now - d) / 3_600_000;
  if (diffHrs < 1) return `${Math.round(diffHrs * 60)}m ago`;
  if (diffHrs < 24) return `${Math.round(diffHrs)}h ago`;
  if (diffHrs < 24 * 7) return `${Math.round(diffHrs / 24)}d ago`;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};


export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const isCandidate = user?.role === 'candidate';

  useEffect(() => {
    Promise.all([api.get('/reports/stats'), api.get('/reports/')])
      .then(([s, r]) => {
        setStats(s);
        setRows(r);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="text-sm" style={{ color: C.muted, fontFamily: F_MONO }}>
        Loading dashboard…
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="p-4 rounded-sm text-sm"
        style={{ background: C.crimsonBg, color: C.crimson }}
      >
        Failed to load: {error}
      </div>
    );
  }

  const pieData = [
    { name: 'Low', value: stats.low, color: C.forest },
    { name: 'Medium', value: stats.medium, color: C.amber },
    { name: 'High', value: stats.high, color: C.crimson },
  ];

  return (
    <div>
      {/* ============ Header (role-aware) ============ */}
      <div className="flex items-end justify-between mb-8">
        <div>
          <div
            className="text-xs"
            style={{ fontFamily: F_MONO, color: C.muted, letterSpacing: '0.15em' }}
          >
            {isCandidate ? 'WELCOME BACK' : 'CASE FILE'} ·{' '}
            {new Date()
              .toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
              .toUpperCase()}
          </div>
          <h1
            style={{
              fontFamily: F_DISP,
              fontSize: 40,
              fontWeight: 500,
              lineHeight: 1.1,
              color: C.ink,
            }}
          >
            {isCandidate
              ? `Hello, ${user.name.split(' ')[0]}`
              : 'Overview'}
          </h1>
          {isCandidate && (
            <p className="text-sm mt-2 max-w-lg" style={{ color: C.muted }}>
              Upload your resume to see how a recruiter's fraud detection system
              would score it — and fix issues before you apply.
            </p>
          )}
        </div>
        <button
          onClick={() => navigate('/upload')}
          className="px-4 py-2.5 text-sm rounded-sm inline-flex items-center gap-2 active:scale-[0.98]"
          style={{ background: C.ink, color: C.cream }}
        >
          <Plus size={16} strokeWidth={1.75} />{' '}
          {isCandidate ? 'Analyze my resume' : 'New analysis'}
        </button>
      </div>

      {/* ============ Stat cards ============ */}
      <div
        className="grid grid-cols-4 gap-0 mb-8"
        style={{ border: `1px solid ${C.border}`, background: C.soft }}
      >
        {[
          { label: isCandidate ? 'Resumes analyzed' : 'Resumes analyzed', value: stats.total, sub: 'All time', accent: C.ink },
          { label: 'High risk', value: stats.high, sub: `${pct(stats.high, stats.total)}% of total`, accent: C.crimson },
          { label: 'Medium risk', value: stats.medium, sub: `${pct(stats.medium, stats.total)}% of total`, accent: C.amber },
          { label: 'Average score', value: stats.avg_score, sub: 'out of 100', accent: C.ink },
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
                fontFamily: F_DISP,
                fontSize: 42,
                fontWeight: 500,
                color: s.accent,
                lineHeight: 1,
              }}
            >
              {s.value}
            </div>
            <div className="text-xs mt-2" style={{ color: C.muted }}>
              {s.sub}
            </div>
          </div>
        ))}
      </div>

      {/* ============ Pie ============ */}
      {stats.total > 0 && (
        <div
          className="p-5 mb-8 rounded-sm"
          style={{ background: C.soft, border: `1px solid ${C.border}` }}
        >
          <div
            className="text-xs mb-4"
            style={{ fontFamily: F_MONO, color: C.muted, letterSpacing: '0.1em' }}
          >
            RISK DISTRIBUTION
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={pieData} dataKey="value" innerRadius={45} outerRadius={75} strokeWidth={0}>
                {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: C.soft,
                  border: `1px solid ${C.border}`,
                  fontFamily: F_MONO,
                  fontSize: 11,
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div
            className="flex justify-center gap-4 text-xs mt-2"
            style={{ fontFamily: F_MONO }}
          >
            {pieData.map((p) => (
              <span key={p.name} className="flex items-center gap-1.5">
                <span className="w-2 h-2" style={{ background: p.color }} />
                <span style={{ color: C.muted }}>{p.name}</span>
                <span style={{ color: C.ink }}>{p.value}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ============ Recent submissions table ============ */}
      <div className="flex items-baseline gap-3 mb-4">
        <span style={{ fontFamily: F_MONO, fontSize: 10, color: C.muted, letterSpacing: '0.15em' }}>
          § 01
        </span>
        <h2 style={{ fontFamily: F_DISP, fontSize: 22, color: C.ink, fontWeight: 500 }}>
          {isCandidate ? 'My recent uploads' : 'Recent submissions'}
        </h2>
        <div className="flex-1 border-t border-dashed mt-3" style={{ borderColor: C.border }} />
      </div>

      {rows.length === 0 ? (
        <div
          className="p-8 text-center text-sm rounded-sm"
          style={{ background: C.soft, border: `1px solid ${C.border}`, color: C.muted }}
        >
          {isCandidate
            ? 'You haven\'t analyzed any resumes yet. '
            : 'No resumes analyzed yet. '}
          <button
            onClick={() => navigate('/upload')}
            style={{ color: C.ink, textDecoration: 'underline' }}
          >
            {isCandidate ? 'Check your resume →' : 'Upload your first one →'}
          </button>
        </div>
      ) : (
        <div
          className="rounded-sm overflow-hidden"
          style={{ background: C.soft, border: `1px solid ${C.border}` }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {['Candidate', 'File', 'Submitted', 'Risk', 'Status', ''].map((h, i) => (
                  <th
                    key={i}
                    className="text-left px-5 py-3 text-xs"
                    style={{ fontFamily: F_MONO, color: C.muted, fontWeight: 400, letterSpacing: '0.1em' }}
                  >
                    {h.toUpperCase()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 8).map((r) => {
                const rs = riskColor(r.risk_level);
                const dp = decisionPill(r.decision);
                return (
                  <tr
                    key={r.resume_id}
                    onClick={() => navigate(`/reports/${r.resume_id}`)}
                    className="cursor-pointer transition-colors"
                    style={{ borderBottom: `1px solid ${C.border}` }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = C.parchment)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td className="px-5 py-4">
                      <div style={{ color: C.ink, fontWeight: 500 }}>
                        {r.candidate_name || '—'}
                      </div>
                      <div className="text-xs" style={{ color: C.muted, fontFamily: F_MONO }}>
                        RSM-{String(r.resume_id).padStart(4, '0')}
                      </div>
                    </td>
                    <td
                      className="px-5 py-4 text-xs truncate max-w-xs"
                      style={{ color: C.muted, fontFamily: F_MONO }}
                    >
                      {r.filename}
                    </td>
                    <td className="px-5 py-4 text-xs" style={{ color: C.muted, fontFamily: F_MONO }}>
                      {formatWhen(r.uploaded_at)}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-1" style={{ background: C.parchment }}>
                          <div
                            className="h-full"
                            style={{ width: `${r.risk_score}%`, background: rs.fg }}
                          />
                        </div>
                        <span style={{ fontFamily: F_MONO, fontSize: 12, color: rs.fg }}>
                          {r.risk_score}
                        </span>
                        <span
                          className="px-1.5 py-0.5 text-xs"
                          style={{
                            fontFamily: F_MONO,
                            color: rs.fg,
                            background: rs.bg,
                            letterSpacing: '0.05em',
                          }}
                        >
                          {rs.label}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-xs"
                        style={{
                          color: dp.fg,
                          background: dp.bg,
                          fontFamily: F_MONO,
                          letterSpacing: '0.02em',
                        }}
                      >
                        <span className="w-1 h-1 rounded-full" style={{ background: dp.fg }} />
                        {dp.t}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <ChevronRight size={14} style={{ color: C.muted }} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function pct(a, b) {
  return b === 0 ? 0 : Math.round((a / b) * 100);
}