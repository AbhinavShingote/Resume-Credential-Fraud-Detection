/**
 * Report detail page — the most important view in the app.
 *
 * URL: /reports/:id (the :id is the resume_id)
 *
 * Sections:
 *   1. Header: candidate name + circular risk gauge
 *   2. Flags: list of every detected fraud signal with severity
 *   3. Extracted data: contact info, companies, skills (left)
 *   4. Certificate results: OCR + ELA verdicts (right)
 *   5. Decision bar: approve / reject / flag buttons
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle, AlertTriangle, Award, Building2, Calendar, CheckCircle2,
  ChevronRight, FileText, Fingerprint, Flag, ScanLine, XCircle,
} from 'lucide-react';

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

// Map flag types → (icon, human label) so reports are readable
const FLAG_META = {
  date_overlap:     { label: 'Overlapping employment dates',     icon: Calendar },
  date_future:      { label: 'Future-dated experience',          icon: Calendar },
  metadata_tamper:  { label: 'PDF metadata tampering',           icon: Fingerprint },
  cert_tamper:      { label: 'Certificate image tampering (ELA)', icon: ScanLine },
  template_reuse:   { label: 'Template fingerprint reuse',       icon: FileText },
  fake_company:     { label: 'Company not in verified registry', icon: Building2 },
  low_content:      { label: 'Resume has very little content',   icon: AlertCircle },
  skill_inflation:  { label: 'Skill duration inflation',         icon: AlertCircle },
};

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


export default function Report() {
  const { id } = useParams();   // /reports/42 → id = "42"
  const navigate = useNavigate();

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Find the report for this resume_id.
  // The list endpoint already has what we need; we then fetch the full report.
useEffect(() => {
    setLoading(true);
    setError('');
    api.get(`/reports/by-resume/${id}`)
      .then(setReport)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);


  const handleDecision = async (decision) => {
    try {
      const updated = await api.patch(`/reports/${report.id}/decision`, { decision });
      setReport(updated);
    } catch (e) {
      setError(e.message);
    }
  };


  if (loading) {
    return (
      <div className="text-sm" style={{ color: C.muted, fontFamily: F_MONO }}>
        Loading report…
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-4 rounded-sm text-sm" style={{ background: C.crimsonBg, color: C.crimson }}>
        {error}
      </div>
    );
  }
  if (!report) return null;

  const rs = riskColor(report.risk_level);
  const dp = decisionPill(report.decision);
  const extracted = report.extracted_data || {};
  const flags = report.flags || [];
  const certResults = report.cert_results || {};


  return (
    <div>
      {/* ============ Back link ============ */}
      <button
        onClick={() => navigate('/reports')}
        className="text-xs mb-6 flex items-center gap-1.5"
        style={{ color: C.muted, fontFamily: F_MONO }}
      >
        <ChevronRight size={12} className="rotate-180" /> BACK TO REPORTS
      </button>

      {/* ============ Header row: name + risk gauge ============ */}
      <div className="grid grid-cols-3 gap-6 mb-8">
        <div className="col-span-2">
          <div
            className="text-xs mb-2"
            style={{ fontFamily: F_MONO, color: C.muted, letterSpacing: '0.15em' }}
          >
            CASE · RSM-{String(report.resume_id).padStart(4, '0')}
          </div>
          <h1
            style={{
              fontFamily: F_DISP, fontSize: 44, fontWeight: 500,
              color: C.ink, lineHeight: 1.05,
            }}
          >
            {extracted.name || 'Unknown candidate'}
          </h1>
          <div
            className="mt-2 flex items-center gap-4 text-sm flex-wrap"
            style={{ color: C.muted }}
          >
            {extracted.email && <span>{extracted.email}</span>}
            {extracted.phone && <><span>·</span><span>{extracted.phone}</span></>}
            <span>·</span>
            <span style={{ fontFamily: F_MONO }}>
              {new Date(report.generated_at).toLocaleString('en-IN')}
            </span>
          </div>
          <div className="mt-4 flex gap-2 flex-wrap">
            <span
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-xs"
              style={{
                color: dp.fg, background: dp.bg, fontFamily: F_MONO, letterSpacing: '0.02em',
              }}
            >
              <span className="w-1 h-1 rounded-full" style={{ background: dp.fg }} />
              {dp.t}
            </span>
            <span
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-xs"
              style={{
                color: rs.fg, background: rs.bg, fontFamily: F_MONO, letterSpacing: '0.05em',
              }}
            >
              <Flag size={10} /> {flags.length} FLAG{flags.length !== 1 && 'S'}
            </span>
          </div>
        </div>

        <div
          className="flex flex-col items-center justify-center p-5 rounded-sm"
          style={{ background: C.soft, border: `1px solid ${C.border}` }}
        >
          <div
            className="text-xs mb-2"
            style={{ fontFamily: F_MONO, color: C.muted, letterSpacing: '0.1em' }}
          >
            RISK SCORE
          </div>
          <RiskGauge score={report.risk_score} color={rs.fg} label={rs.label} />
        </div>
      </div>

      {/* ============ Flags ============ */}
      <SectionLabel num="01">Detected anomalies</SectionLabel>
      <div
        className="rounded-sm mb-8"
        style={{ background: C.soft, border: `1px solid ${C.border}` }}
      >
        {flags.length === 0 ? (
          <div className="p-8 text-center">
            <CheckCircle2 size={32} style={{ color: C.forest, margin: '0 auto 12px' }} />
            <div style={{ fontFamily: F_DISP, fontSize: 18, color: C.ink }}>
              No anomalies detected
            </div>
            <div className="text-sm mt-1" style={{ color: C.muted }}>
              Candidate passed all verification checks.
            </div>
          </div>
        ) : (
          flags.map((f, i) => {
            const meta = FLAG_META[f.type] || { label: f.type, icon: AlertTriangle };
            const sev = riskColor(f.severity);
            const Icon = meta.icon;
            return (
              <div
                key={i}
                className="p-4 flex items-start gap-4"
                style={{
                  borderBottom: i < flags.length - 1 ? `1px solid ${C.border}` : 'none',
                }}
              >
                <div
                  className="shrink-0 mt-0.5 p-2 rounded-sm"
                  style={{ background: sev.bg, color: sev.fg }}
                >
                  <Icon size={14} strokeWidth={1.75} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span style={{ color: C.ink, fontWeight: 500, fontSize: 14 }}>
                      {meta.label}
                    </span>
                    <span
                      className="px-1.5 py-0.5 text-xs"
                      style={{
                        color: sev.fg, background: sev.bg,
                        fontFamily: F_MONO, letterSpacing: '0.05em',
                      }}
                    >
                      {sev.label}
                    </span>
                  </div>
                  <p className="text-sm mt-1" style={{ color: C.muted }}>
                    {f.detail}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ============ Two-column: extracted data + certs ============ */}
      <div className="grid grid-cols-2 gap-6 mb-8">
        <div>
          <SectionLabel num="02">Extracted data</SectionLabel>
          <div
            className="p-5 text-sm rounded-sm"
            style={{ background: C.soft, border: `1px solid ${C.border}` }}
          >
            <DataRow k="Name"      v={extracted.name} />
            <DataRow k="Email"     v={extracted.email} />
            <DataRow k="Phone"     v={extracted.phone} />
            <DataRow k="Companies" v={(extracted.companies || []).join(' · ') || '—'} />
            <DataRow k="Skills"    v={(extracted.skills || []).join(' · ') || '—'} last />
          </div>
        </div>

        <div>
          <SectionLabel num="03">Certificate verification</SectionLabel>
          <div
            className="rounded-sm"
            style={{ background: C.soft, border: `1px solid ${C.border}` }}
          >
            {Object.keys(certResults).length === 0 ? (
              <div className="p-5 text-sm" style={{ color: C.muted }}>
                No certificates submitted with this resume.
              </div>
            ) : (
              Object.entries(certResults).map(([name, r], i, arr) => {
                const color = r.status === 'verified' ? C.forest
                  : r.status === 'suspicious' ? C.amber : C.crimson;
                const bg = r.status === 'verified' ? C.forestBg
                  : r.status === 'suspicious' ? C.amberBg : C.crimsonBg;
                const Icon = r.status === 'verified' ? CheckCircle2
                  : r.status === 'suspicious' ? AlertTriangle : XCircle;
                return (
                  <div
                    key={name}
                    className="p-4 flex items-center gap-4"
                    style={{
                      borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : 'none',
                    }}
                  >
                    <div className="p-2 rounded-sm" style={{ background: bg, color }}>
                      <Icon size={14} strokeWidth={1.75} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div style={{ color: C.ink, fontSize: 14, fontWeight: 500 }}>
                        {name}
                      </div>
                    </div>
                    <div className="text-right">
                      <div
                        className="text-xs uppercase"
                        style={{ color, fontFamily: F_MONO, letterSpacing: '0.05em' }}
                      >
                        {r.status}
                      </div>
                      <div
                        className="text-xs"
                        style={{ color: C.muted, fontFamily: F_MONO }}
                      >
                        conf {(r.confidence ?? 0).toFixed(2)}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ============ Decision bar ============ */}
      <div
        className="p-5 rounded-sm flex items-center justify-between flex-wrap gap-4"
        style={{ background: C.soft, border: `1px solid ${C.border}` }}
      >
        <div>
          <div
            className="text-xs"
            style={{ fontFamily: F_MONO, color: C.muted, letterSpacing: '0.1em' }}
          >
            RECRUITER DECISION
          </div>
          <div className="mt-1 text-sm" style={{ color: C.ink }}>
            Record your verdict on this candidate.
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handleDecision('rejected')}
            className="px-4 py-2 text-sm rounded-sm inline-flex items-center gap-2"
            style={{ background: C.crimson, color: C.cream }}
          >
            <XCircle size={14} /> Reject
          </button>
          <button
            onClick={() => handleDecision('pending')}
            className="px-4 py-2 text-sm rounded-sm inline-flex items-center gap-2"
            style={{ background: 'transparent', color: C.ink, border: `1px solid ${C.border}` }}
          >
            <Flag size={14} /> Flag for review
          </button>
          <button
            onClick={() => handleDecision('approved')}
            className="px-4 py-2 text-sm rounded-sm inline-flex items-center gap-2"
            style={{ background: C.ink, color: C.cream }}
          >
            <CheckCircle2 size={14} /> Approve
          </button>
        </div>
      </div>
    </div>
  );
}


// ---------------- Small sub-components ----------------

function SectionLabel({ num, children }) {
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
        style={{
          fontFamily: F_DISP, fontSize: 22, color: C.ink, fontWeight: 500,
        }}
      >
        {children}
      </h2>
      <div
        className="flex-1 border-t border-dashed mt-3"
        style={{ borderColor: C.border }}
      />
    </div>
  );
}

function DataRow({ k, v, last }) {
  return (
    <div
      className="flex gap-4 py-2"
      style={{ borderBottom: last ? 'none' : `1px dashed ${C.border}` }}
    >
      <div
        className="w-24 shrink-0 text-xs uppercase"
        style={{
          fontFamily: F_MONO, color: C.muted, letterSpacing: '0.1em', paddingTop: 2,
        }}
      >
        {k}
      </div>
      <div style={{ color: C.ink }}>{v || '—'}</div>
    </div>
  );
}

function RiskGauge({ score, color, label }) {
  const circumference = 2 * Math.PI * 58;
  const offset = circumference * (1 - score / 100);
  return (
    <div className="relative">
      <svg width="140" height="140">
        <circle cx="70" cy="70" r="58" fill="none" stroke={C.parchment} strokeWidth="8" />
        <circle
          cx="70" cy="70" r="58" fill="none"
          stroke={color} strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 70 70)"
          strokeLinecap="butt"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div style={{ fontFamily: F_DISP, fontSize: 44, color: C.ink, lineHeight: 1 }}>
          {score}
        </div>
        <div
          className="text-xs mt-1"
          style={{ fontFamily: F_MONO, color, letterSpacing: '0.1em' }}
        >
          {label} RISK
        </div>
      </div>
    </div>
  );
}


// ---------------- Helpers ----------------

/**
 * Given the full reports list (from GET /reports/) and a resume_id,
 * find the corresponding report.id. Simple linear scan — fine for
 * academic scale (<1000 reports per user).
 *
 * NOTE: in a production system we'd expose GET /reports/by-resume/{id}
 * to avoid this two-step lookup. Kept simple here to avoid adding
 * another route just for the frontend.
 */
