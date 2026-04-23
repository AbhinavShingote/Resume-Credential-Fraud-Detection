/**
 * Login page — handles both sign-in AND registration.
 *
 * The page has a single state variable `mode` that toggles between
 * "login" and "register" — same UI shell, different fields and submit logic.
 *
 * In register mode, users also choose their role: Recruiter or Candidate.
 *
 * On success, useAuth().login() / register() saves the JWT to localStorage
 * and the redirect in App.jsx sends them to the dashboard.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield } from 'lucide-react';

import { useAuth } from '../auth.jsx';

export default function Login() {
  const { login, register, loading } = useAuth();
  const navigate = useNavigate();

  // Toggle between sign-in and sign-up
  const [mode, setMode] = useState('login'); // 'login' | 'register'

  // Form fields — start empty for a professional look
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('recruiter'); // only used in register mode

  const [error, setError] = useState('');

  const isRegister = mode === 'register';

  const switchMode = () => {
    setError('');
    setEmail('');
    setPassword('');
    setName('');
    setRole('recruiter');
    setMode(isRegister ? 'login' : 'register');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (isRegister) {
        await register(email, name, password, role);
      } else {
        await login(email, password);
      }
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || (isRegister ? 'Registration failed' : 'Login failed'));
    }
  };

  return (
    <div
      className="min-h-screen flex"
      style={{ background: '#faf7f0', fontFamily: "'DM Sans', sans-serif" }}
    >
      {/* ============ LEFT PANEL (desktop only) ============ */}
      <div
        className="hidden md:flex flex-col justify-between p-12 flex-1"
        style={{ background: '#1a1918', color: '#faf7f0' }}
      >
        <div className="flex items-center gap-2">
          <Shield size={20} strokeWidth={1.5} />
          <span style={{ fontFamily: "'Fraunces', serif", fontSize: 20 }}>
            VisiVerify
          </span>
        </div>

        <div>
          <div
            className="text-xs mb-4 opacity-60"
            style={{ fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.1em' }}
          >
            CASE FILE № 2026-04
          </div>
          <h1
            style={{
              fontFamily: "'Fraunces', serif",
              fontSize: 48,
              lineHeight: 1.05,
              fontWeight: 400,
            }}
          >
            Every resume tells a story.
            <br />
            <em>Some of them lie.</em>
          </h1>
          <p className="mt-6 max-w-md opacity-70 text-sm leading-relaxed">
            Resume &amp; Credential Fraud Detection Platform. Parse, analyze,
            and verify every candidate submission — catching template reuse,
            metadata tampering, and forged certificates before they reach
            your shortlist.
          </p>
        </div>

        <div
          className="flex items-center justify-between text-xs opacity-50"
          style={{ fontFamily: "'IBM Plex Mono', monospace" }}
        >
          <span>MIT ACADEMY OF ENGINEERING</span>
          <span>v1.0 · 2026</span>
        </div>
      </div>

      {/* ============ RIGHT PANEL — FORM ============ */}
      <div className="flex-1 flex items-center justify-center p-8">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-sm p-8 rounded-sm"
          style={{ background: '#ffffff', border: '1px solid #e7e0cc' }}
        >
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 md:hidden">
            <Shield size={18} />
            <span style={{ fontFamily: "'Fraunces', serif", fontSize: 18 }}>
              VisiVerify
            </span>
          </div>

          <div
            className="text-xs mb-2"
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              color: '#6b6862',
              letterSpacing: '0.15em',
            }}
          >
            {isRegister ? 'NEW ACCOUNT' : 'ACCESS CONTROL'}
          </div>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 500 }}>
            {isRegister ? 'Create account' : 'Sign in'}
          </h2>
          <p className="text-sm mt-1" style={{ color: '#6b6862' }}>
            {isRegister
              ? 'Create your account in seconds.'
              : 'Sign in to continue to your dashboard.'}
          </p>

          {/* --- Fields --- */}
          <div className="mt-8 space-y-4">

            {/* Name field — only shown in register mode */}
            {isRegister && (
              <div>
                <label
                  className="text-xs"
                  style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    color: '#6b6862',
                    letterSpacing: '0.1em',
                  }}
                >
                  FULL NAME
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  minLength={2}
                  placeholder="e.g. Priya Sharma"
                  className="w-full mt-1 px-3 py-2.5 text-sm outline-none"
                  style={{
                    background: '#faf7f0',
                    border: '1px solid #e7e0cc',
                    color: '#1a1918',
                    fontFamily: "'IBM Plex Mono', monospace",
                  }}
                />
              </div>
            )}

            {/* Role picker — only shown in register mode */}
            {isRegister && (
              <div>
                <label
                  className="text-xs"
                  style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    color: '#6b6862',
                    letterSpacing: '0.1em',
                  }}
                >
                  I AM A
                </label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {[
                    { value: 'recruiter', label: 'Recruiter', sub: 'I hire people' },
                    { value: 'candidate', label: 'Candidate', sub: 'I want to check my resume' },
                  ].map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setRole(r.value)}
                      className="p-3 text-left rounded-sm transition-all"
                      style={{
                        background: role === r.value ? '#1a1918' : '#faf7f0',
                        color: role === r.value ? '#faf7f0' : '#1a1918',
                        border: `1px solid ${role === r.value ? '#1a1918' : '#e7e0cc'}`,
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{r.label}</div>
                      <div
                        style={{
                          fontSize: 10,
                          opacity: 0.7,
                          fontFamily: "'IBM Plex Mono', monospace",
                          marginTop: 2,
                        }}
                      >
                        {r.sub}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label
                className="text-xs"
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  color: '#6b6862',
                  letterSpacing: '0.1em',
                }}
              >
                EMAIL
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder={isRegister ? 'you@company.com' : ''}
                className="w-full mt-1 px-3 py-2.5 text-sm outline-none"
                style={{
                  background: '#faf7f0',
                  border: '1px solid #e7e0cc',
                  color: '#1a1918',
                  fontFamily: "'IBM Plex Mono', monospace",
                }}
              />
            </div>

            <div>
              <label
                className="text-xs"
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  color: '#6b6862',
                  letterSpacing: '0.1em',
                }}
              >
                PASSWORD
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                placeholder={isRegister ? 'min 8 characters' : ''}
                className="w-full mt-1 px-3 py-2.5 text-sm outline-none"
                style={{
                  background: '#faf7f0',
                  border: '1px solid #e7e0cc',
                  color: '#1a1918',
                  fontFamily: "'IBM Plex Mono', monospace",
                }}
              />
            </div>

            {/* Inline error message */}
            {error && (
              <div
                className="text-xs px-3 py-2 rounded-sm"
                style={{ background: '#fbeceb', color: '#991b1b' }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-2.5 text-sm rounded-sm transition-all active:scale-[0.98]"
              style={{
                background: '#1a1918',
                color: '#faf7f0',
                fontFamily: "'DM Sans', sans-serif",
                opacity: loading ? 0.6 : 1,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading
                ? (isRegister ? 'Creating account…' : 'Signing in…')
                : (isRegister ? 'Create account' : 'Sign in')}
            </button>
          </div>

          {/* --- Mode toggle --- */}
          <div
            className="mt-6 pt-6 border-t border-dashed text-xs text-center"
            style={{ borderColor: '#e7e0cc', color: '#6b6862' }}
          >
            {isRegister ? (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={switchMode}
                  style={{
                    color: '#1a1918',
                    textDecoration: 'underline',
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  Sign in
                </button>
              </>
            ) : (
              <>
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={switchMode}
                  style={{
                    color: '#1a1918',
                    textDecoration: 'underline',
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  Create one
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}