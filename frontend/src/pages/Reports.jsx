/**
 * Reports list page — searchable, filterable archive.
 *
 * Filters:
 *   - Risk level: all / low / medium / high
 *   - Decision:   all / pending / approved / rejected
 *   - Free-text search on candidate name or case ID
 *
 * Filters send query params to the backend (GET /reports/?level=high).
 * Search is local (client-side) because the result set is small per user.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Search } from 'lucide-react';

import { api } from '../api.js';

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
  low:    { fg: C.forest,  bg: C.forestBg,  label: 'LOW' },
  medium: { fg: C.amber,   bg: C.amberBg,   label: 'MED' },
  high:   { fg: C.crimson, bg: C.crimsonBg, label: 'HIGH' },
}[level] || { fg: C.muted, bg: C.parchment, label: level?.toUpperCase() });

const decisionPill = (d) => ({
  pending:  { fg: C.amber,   bg: C.amberBg,   t: 'Pending review' },
  approved: { fg: C.forest,  bg: C.forestBg,  t: 'Approved' },
  rejected: { fg: C.crimson, bg: C.crimsonBg, t: 'Rejected' },
}[d] || { fg: C.muted, bg: C.parchment, t: d || '—' });


export default function Reports() {
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [level, setLevel] = useState('all');       // all | low | medium | high
  const [decision, setDecision] = useState('all'); // all | pending | approved | rejected
  const [query, setQuery] = useState('');


  // Re-fetch whenever the level or decision filter changes
  useEffect(() => {
    setLoading(true);
    setError('');

    const params = new URLSearchParams();
    if (level !== 'all') params.append('level', level);
    if (decision !== 'all') params.append('decision', decision);
    const qs = params.toString();

    api.get(`/reports/${qs ? '?' + qs : ''}`)
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [level, decision]);


  // Client-side search across name + case ID
  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      const name = (r.candidate_name || '').toLowerCase();
      const caseId = `rsm-${String(r.resume_id).padStart(4, '0')}`;
      const filename = (r.filename || '').toLowerCase();
      return name.includes(q) || caseId.includes(q) || filename.includes(q);
    });
  }, [rows, query]);


  return (
    <div>
      {/* ============ Header ============ */}
      <div
        className="text-xs mb-2"
        style={{ fontFamily: F_MONO, color: C.muted, letterSpacing: '0.15em' }}
      >
        ARCHIVE
      </div>
      <h1
        style={{ fontFamily: F_DISP, fontSize: 40, fontWeight: 500, color: C.ink }}
      >
        All reports
      </h1>

      {/* ============ Filter bar ============ */}
      <div className="flex items-center gap-3 my-6 flex-wrap">
        {/* Search box */}
        <div
          className="flex items-center gap-2 px-3 py-2 flex-1 max-w-sm rounded-sm"
          style={{ background: C.soft, border: `1px solid ${C.border}` }}
        >
          <Search size={14} style={{ color: C.muted }} />
          <input
            placeholder="Search by name, case ID, or filename…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: C.ink, fontFamily: F_MONO }}
          />
        </div>

        {/* Risk filter pills */}
        <FilterPills
          value={level}
          onChange={setLevel}
          options={['all', 'high', 'medium', 'low']}
        />

        {/* Decision filter pills */}
        <FilterPills
          value={decision}
          onChange={setDecision}
          options={['all', 'pending', 'approved', 'rejected']}
        />
      </div>

      {/* ============ Results ============ */}
      {loading ? (
        <div className="text-sm" style={{ color: C.muted, fontFamily: F_MONO }}>
          Loading…
        </div>
      ) : error ? (
        <div
          className="p-4 rounded-sm text-sm"
          style={{ background: C.crimsonBg, color: C.crimson }}
        >
          {error}
        </div>
      ) : filtered.length === 0 ? (
        <div
          className="p-8 text-center text-sm rounded-sm"
          style={{
            background: C.soft, border: `1px solid ${C.border}`, color: C.muted,
          }}
        >
          {rows.length === 0
            ? 'No reports yet. Head to New analysis to upload your first resume.'
            : 'No reports match your filters.'}
        </div>
      ) : (
        <div
          className="rounded-sm overflow-hidden"
          style={{ background: C.soft, border: `1px solid ${C.border}` }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {['Case ID', 'Candidate', 'File', 'Score', 'Flags', 'Status', '']
                  .map((h, i) => (
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
              {filtered.map((r) => {
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
                    <td
                      className="px-5 py-4 text-xs"
                      style={{ fontFamily: F_MONO, color: C.ink }}
                    >
                      RSM-{String(r.resume_id).padStart(4, '0')}
                    </td>
                    <td
                      className="px-5 py-4"
                      style={{ color: C.ink, fontWeight: 500 }}
                    >
                      {r.candidate_name || '—'}
                    </td>
                    <td
                      className="px-5 py-4 text-xs max-w-xs truncate"
                      style={{ color: C.muted, fontFamily: F_MONO }}
                    >
                      {r.filename}
                    </td>
                    <td className="px-5 py-4">
                      <span style={{ fontFamily: F_MONO, color: rs.fg, fontSize: 13 }}>
                        {r.risk_score}
                      </span>
                      <span
                        className="ml-2 px-1.5 py-0.5 text-xs"
                        style={{
                          fontFamily: F_MONO, color: rs.fg, background: rs.bg,
                          letterSpacing: '0.05em',
                        }}
                      >
                        {rs.label}
                      </span>
                    </td>
                    <td
                      className="px-5 py-4 text-sm"
                      style={{ color: C.muted, fontFamily: F_MONO }}
                    >
                      {r.flag_count}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-xs"
                        style={{
                          color: dp.fg, background: dp.bg,
                          fontFamily: F_MONO, letterSpacing: '0.02em',
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

      {/* Small footer: result count */}
      {!loading && !error && filtered.length > 0 && (
        <div
          className="mt-4 text-xs text-right"
          style={{ color: C.muted, fontFamily: F_MONO }}
        >
          Showing {filtered.length} of {rows.length} reports
        </div>
      )}
    </div>
  );
}


// ---------------- Sub-components ----------------

function FilterPills({ value, onChange, options }) {
  return (
    <div className="flex gap-1">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className="px-3 py-2 text-xs uppercase rounded-sm transition-colors"
          style={{
            fontFamily: F_MONO, letterSpacing: '0.1em',
            background: value === opt ? C.ink : 'transparent',
            color: value === opt ? C.cream : C.muted,
            border: `1px solid ${value === opt ? C.ink : C.border}`,
          }}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}