/**
 * Upload page — the intake form for new resumes.
 *
 * Flow:
 *   1. User drops / picks a PDF or DOCX
 *   2. Validate type + size client-side (friendly errors matching backend)
 *   3. POST to /resumes/upload (multipart/form-data)
 *   4. Animated 4-stage progress while backend analyzes
 *   5. On success, navigate to /reports/{resume_id}
 *
 * Heading and copy adapt based on user role:
 *   - candidate → "Analyze your resume" + self-check messaging
 *   - recruiter/admin → "New analysis" + professional case-file tone
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, CheckCircle2, FileText, FileUp, Loader2, Upload as UploadIcon,
} from 'lucide-react';

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
  crimson: '#991b1b',
  crimsonBg: '#fbeceb',
};

const F_DISP = "'Fraunces', Georgia, serif";
const F_MONO = "'IBM Plex Mono', monospace";

const MAX_MB = 5;
const ALLOWED = ['.pdf', '.docx'];

const STAGES = [
  { key: 'uploading', label: 'Uploading file to secure storage' },
  { key: 'parsing',   label: 'Parsing resume · extracting entities via spaCy NER' },
  { key: 'detecting', label: 'Fraud detection · metadata + dates + template checks' },
  { key: 'scoring',   label: 'Weighted risk scoring · generating report' },
];


export default function Upload() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [filename, setFilename] = useState('');
  const [phase, setPhase] = useState('idle'); // idle | analyzing | done | error
  const [currentStage, setCurrentStage] = useState(0);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const isCandidate = user?.role === 'candidate';

  const validate = (file) => {
    if (!file) return 'No file selected';

    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!ALLOWED.includes(ext)) {
      return `Only ${ALLOWED.join(' or ')} files are allowed`;
    }
    if (file.size === 0) return 'File is empty';
    if (file.size > MAX_MB * 1024 * 1024) {
      return `File exceeds ${MAX_MB} MB limit`;
    }
    return null;
  };

  const handleFile = async (file) => {
    const err = validate(file);
    if (err) {
      setError(err);
      return;
    }

    setError('');
    setFilename(file.name);
    setPhase('analyzing');
    setCurrentStage(0);

    // Cosmetic stage ticker — advances ~every 650ms for visual progress
    const ticker = setInterval(() => {
      setCurrentStage((s) => (s < STAGES.length - 1 ? s + 1 : s));
    }, 650);

    try {
      const report = await api.upload('/resumes/upload', file);
      clearInterval(ticker);
      setCurrentStage(STAGES.length);
      setPhase('done');

      setTimeout(() => {
        navigate(`/reports/${report.resume_id}`, { replace: true });
      }, 600);
    } catch (e) {
      clearInterval(ticker);
      setPhase('error');
      setError(e.message || 'Upload failed');
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div className="max-w-3xl">
      {/* ============ Header (role-aware) ============ */}
      <div
        className="text-xs mb-2"
        style={{ fontFamily: F_MONO, color: C.muted, letterSpacing: '0.15em' }}
      >
        {isCandidate ? 'SELF CHECK' : 'INTAKE · STAGE 01'}
      </div>
      <h1 style={{ fontFamily: F_DISP, fontSize: 40, fontWeight: 500, color: C.ink }}>
        {isCandidate ? 'Analyze your resume' : 'New analysis'}
      </h1>
      <p className="text-sm mt-2 mb-8" style={{ color: C.muted }}>
        {isCandidate
          ? 'Upload your resume to see how a recruiter\'s fraud detection system would score it. You\'ll get a detailed report showing any issues you should fix before applying to jobs.'
          : 'Upload a resume in PDF or DOCX format. The full fraud pipeline — parsing, metadata checks, company verification, and risk scoring — runs automatically.'}
      </p>

      {/* ============ IDLE: drop zone ============ */}
      {phase === 'idle' && (
        <>
          <label
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className="block cursor-pointer transition-all"
          >
            <input
              type="file"
              accept=".pdf,.docx"
              className="hidden"
              onChange={(e) => handleFile(e.target.files[0])}
            />
            <div
              className="p-16 text-center"
              style={{
                border: `2px dashed ${dragOver ? C.ink : C.border}`,
                background: dragOver ? C.parchment : C.soft,
              }}
            >
              <FileUp
                size={36}
                strokeWidth={1.25}
                style={{ color: C.muted, margin: '0 auto 16px' }}
              />
              <div style={{ fontFamily: F_DISP, fontSize: 20, color: C.ink }}>
                {isCandidate
                  ? 'Drop your resume here, or click to browse'
                  : 'Drop a resume here, or click to browse'}
              </div>
              <div
                className="text-xs mt-2"
                style={{ color: C.muted, fontFamily: F_MONO }}
              >
                PDF or DOCX · max {MAX_MB} MB
              </div>
            </div>
          </label>

          {error && (
            <div
              className="mt-4 px-4 py-3 rounded-sm text-sm flex items-center gap-2"
              style={{ background: C.crimsonBg, color: C.crimson }}
            >
              <AlertTriangle size={14} />
              {error}
            </div>
          )}
        </>
      )}

      {/* ============ ANALYZING / DONE ============ */}
      {(phase === 'analyzing' || phase === 'done') && (
        <div
          className="p-8 rounded-sm"
          style={{ background: C.soft, border: `1px solid ${C.border}` }}
        >
          <div
            className="flex items-center gap-3 mb-6 pb-6 border-b border-dashed"
            style={{ borderColor: C.border }}
          >
            <FileText size={20} style={{ color: C.ink }} />
            <div className="flex-1">
              <div style={{ color: C.ink }}>{filename}</div>
              <div className="text-xs" style={{ color: C.muted, fontFamily: F_MONO }}>
                {phase === 'done' ? 'Analysis complete — opening report…' : 'Analysis in progress'}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {STAGES.map((s, i) => {
              const done = i < currentStage;
              const active = i === currentStage && phase === 'analyzing';
              const finalDone = phase === 'done';
              return (
                <div key={s.key} className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">
                    {done || finalDone ? (
                      <CheckCircle2 size={16} style={{ color: C.forest }} />
                    ) : active ? (
                      <Loader2 size={16} className="animate-spin" style={{ color: C.ink }} />
                    ) : (
                      <div
                        className="w-4 h-4 rounded-full border"
                        style={{ borderColor: C.border }}
                      />
                    )}
                  </div>
                  <div>
                    <div
                      style={{
                        color: done || active || finalDone ? C.ink : C.muted,
                        fontSize: 14,
                      }}
                    >
                      {s.label}
                    </div>
                    {active && (
                      <div
                        className="text-xs mt-0.5"
                        style={{ color: C.muted, fontFamily: F_MONO }}
                      >
                        processing…
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ============ ERROR ============ */}
      {phase === 'error' && (
        <div
          className="p-8 rounded-sm text-center"
          style={{ background: C.soft, border: `1px solid ${C.border}` }}
        >
          <AlertTriangle
            size={32}
            style={{ color: C.crimson, margin: '0 auto 12px' }}
          />
          <div style={{ fontFamily: F_DISP, fontSize: 20, color: C.ink }}>
            Analysis failed
          </div>
          <div className="text-sm mt-2" style={{ color: C.muted }}>
            {error}
          </div>
          <button
            onClick={() => {
              setPhase('idle');
              setError('');
              setFilename('');
              setCurrentStage(0);
            }}
            className="mt-6 px-4 py-2 text-sm rounded-sm inline-flex items-center gap-2"
            style={{ background: C.ink, color: C.cream }}
          >
            <UploadIcon size={14} /> Try another file
          </button>
        </div>
      )}
    </div>
  );
}