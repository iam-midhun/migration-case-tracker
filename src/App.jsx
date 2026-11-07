import Dashboard from './components/Dashboard'
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import {
  Sun, Moon, Mail, Lock, ArrowRight,
  LoaderCircle, ShieldCheck, Eye, EyeOff
} from 'lucide-react'
import './App.css'

function App() {
  const [mode, setMode] = useState('login')
  const [theme, setTheme] = useState(
    () => localStorage.getItem('tracker-theme') || 'light'
  )

  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')

  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('tracker-theme', theme)
  }, [theme])

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return

      if (error) setError(error.message)
      setUser(data?.session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } =
      supabase.auth.onAuthStateChange((event, session) => {
        if (!mounted) return

        setUser(session?.user ?? null)

        if (event === 'PASSWORD_RECOVERY') {
          setMode('reset')
          setMessage('')
          setError('')
        }
      })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  function clearMessages() {
    setMessage('')
    setError('')
  }

  async function handleLogin(e) {
    e.preventDefault()
    clearMessages()
    setSubmitting(true)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (error) setError(error.message)

    setSubmitting(false)
  }

  async function handleSignup(e) {
    e.preventDefault()
    clearMessages()
    setSubmitting(true)

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin
      }
    })

    if (error) {
      setError(error.message)
    } else if (data.session) {
      setMessage('Your account has been created successfully.')
    } else {
      setMode('verification')
      setMessage(`We sent a verification link to ${email}.`)
    }

    setSubmitting(false)
  }

  async function handleForgotPassword(e) {
    e.preventDefault()
    clearMessages()
    setSubmitting(true)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin
    })

    if (error) {
      setError(error.message)
    } else {
      setMessage('If an account exists for this email, a password reset link will be sent.')
    }

    setSubmitting(false)
  }

  async function handleResetPassword(e) {
    e.preventDefault()
    clearMessages()

    if (newPassword.length < 8) {
      setError('Your new password must contain at least 8 characters.')
      return
    }

    setSubmitting(true)

    const { error } = await supabase.auth.updateUser({
      password: newPassword
    })

    if (error) {
      setError(error.message)
    } else {
      setMessage('Password updated successfully.')
      setNewPassword('')
      setMode('login')
    }

    setSubmitting(false)
  }

  async function handleLogout() {
    const { error } = await supabase.auth.signOut()

    if (error) setError(error.message)
    else {
      setMode('login')
      setPassword('')
      setMessage('You have been signed out.')
    }
  }

  function changeMode(nextMode) {
    clearMessages()
    setMode(nextMode)
    setPassword('')
    setNewPassword('')
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <LoaderCircle className="spin" size={28} />
        <p>Loading Migration Case Tracker...</p>
      </div>
    )
  }

  if (user && mode !== 'reset') {
    return (
    <Dashboard
      user={user}
      onLogout={handleLogout}
      theme={theme}
      onToggleTheme={() => setTheme(theme === 'light' ? 'dark' : 'light')}
    />
  
    )
  }

  const titles = {
    login: ['Welcome back', 'Sign in to manage your migration cases.'],
    signup: ['Create your account', 'Set up your personal migration tracker.'],
    forgot: ['Reset your password', 'Enter your email to receive a reset link.'],
    reset: ['Choose a new password', 'Create a new password for your account.'],
    verification: ['Check your email', 'One more step before you can sign in.']
  }

  return (
    <main className="auth-shell">
      <section className="auth-brand-panel">
        <div className="brand">
          <div className="brand-icon"><ShieldCheck size={24} /></div>
          <span>Migration Tracker</span>
        </div>

        <div className="brand-content">
          <span className="eyebrow">MIGRATION OPERATIONS</span>
          <h1>Keep every migration<br />on track.</h1>
          <p>
            Organise migration cases, monitor pending work
            and keep track of every important update.
          </p>
        </div>

        <div className="brand-footer">
          Personal Migration Case Management
        </div>
      </section>

      <section className="auth-form-panel">
        <div className="auth-top-actions">
          <button
            className="theme-button"
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            aria-label="Toggle theme"
          >
            {theme === 'light' ? <Moon size={19} /> : <Sun size={19} />}
          </button>
        </div>

        <div className="auth-card">
          <div className="mobile-brand brand">
            <div className="brand-icon"><ShieldCheck size={22} /></div>
            <span>Migration Tracker</span>
          </div>

          <h2>{titles[mode][0]}</h2>
          <p className="auth-subtitle">{titles[mode][1]}</p>

          {message && <div className="success-message">{message}</div>}
          {error && <div className="error-message">{error}</div>}

          {mode === 'verification' && (
            <div className="verification-panel">
              <Mail size={32} />
              <p>Open the verification email and click the link to activate your account.</p>
              <button className="primary-button" onClick={() => changeMode('login')}>
                Back to sign in
              </button>
            </div>
          )}

          {mode === 'login' && (
            <form onSubmit={handleLogin}>
              <label>Email address</label>
              <div className="input-wrap">
                <Mail size={18} />
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </div>

              <label>Password</label>
              <div className="input-wrap">
                <Lock size={18} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
                <button type="button" className="visibility-button"
                  onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              <button type="button" className="text-button forgot-link"
                onClick={() => changeMode('forgot')}>
                Forgot password?
              </button>

              <button className="primary-button" disabled={submitting}>
                {submitting ? <LoaderCircle className="spin" size={18} /> : 'Sign in'}
                {!submitting && <ArrowRight size={18} />}
              </button>

              <p className="switch-text">
                Don't have an account?
                <button type="button" className="text-button"
                  onClick={() => changeMode('signup')}>Create one</button>
              </p>
            </form>
          )}

          {mode === 'signup' && (
            <form onSubmit={handleSignup}>
              <label>Email address</label>
              <div className="input-wrap">
                <Mail size={18} />
                <input type="email" placeholder="you@example.com"
                  value={email} onChange={e => setEmail(e.target.value)} required />
              </div>

              <label>Password</label>
              <div className="input-wrap">
                <Lock size={18} />
                <input type="password" placeholder="At least 8 characters"
                  value={password} onChange={e => setPassword(e.target.value)}
                  minLength={8} required />
              </div>

              <button className="primary-button" disabled={submitting}>
                {submitting ? <LoaderCircle className="spin" size={18} /> : 'Create account'}
                {!submitting && <ArrowRight size={18} />}
              </button>

              <p className="switch-text">
                Already have an account?
                <button type="button" className="text-button"
                  onClick={() => changeMode('login')}>Sign in</button>
              </p>
            </form>
          )}

          {mode === 'forgot' && (
            <form onSubmit={handleForgotPassword}>
              <label>Email address</label>
              <div className="input-wrap">
                <Mail size={18} />
                <input type="email" placeholder="you@example.com"
                  value={email} onChange={e => setEmail(e.target.value)} required />
              </div>

              <button className="primary-button" disabled={submitting}>
                {submitting ? <LoaderCircle className="spin" size={18} /> : 'Send reset link'}
                {!submitting && <ArrowRight size={18} />}
              </button>

              <p className="switch-text">
                <button type="button" className="text-button"
                  onClick={() => changeMode('login')}>Back to sign in</button>
              </p>
            </form>
          )}

          {mode === 'reset' && (
            <form onSubmit={handleResetPassword}>
              <label>New password</label>
              <div className="input-wrap">
                <Lock size={18} />
                <input type="password" placeholder="At least 8 characters"
                  value={newPassword} onChange={e => setNewPassword(e.target.value)}
                  minLength={8} required />
              </div>

              <button className="primary-button" disabled={submitting}>
                {submitting ? <LoaderCircle className="spin" size={18} /> : 'Update password'}
                {!submitting && <ArrowRight size={18} />}
              </button>
            </form>
          )}

          <p className="security-note">
            <Lock size={14} /> Your account and migration data are protected.
          </p>
        </div>

        <p className="copyright">Migration Case Tracker · Personal workspace</p>
      </section>
    </main>
  )
}

export default App
