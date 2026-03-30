import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Sprout, UserPlus, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordStrength } from '@/components/PasswordStrength';
import { isPasswordValid } from '@/lib/password-validation';
import { useAuthContext } from '@/contexts/AuthContext';
import { useEventStore } from '@/data/store';

const ROLE_OPTIONS = [
  'Event Planner',
  'Development Officer',
  'Director of Events',
  'Coordinator',
  'Administrator',
  'Volunteer Lead',
  'Other',
];

export default function SignUp() {
  const navigate = useNavigate();
  const { signUp, signInWithGoogle } = useAuthContext();
  const pendingInviteCode = useEventStore((s) => s.pendingInviteCode);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState('Event Planner');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const selectClasses = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password) {
      setError('Please fill in all required fields.');
      return;
    }

    if (!isPasswordValid(password)) {
      setError('Password does not meet all requirements.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    const { error: authError } = await signUp(email, password, {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      role,
    });
    setSubmitting(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    if (pendingInviteCode) {
      // After signup, Supabase's onAuthStateChange needs a moment to fire
      // and propagate the user state. Delay navigation so JoinInvite sees
      // the authenticated user instead of redirecting back to sign-up.
      setTimeout(() => {
        navigate(`/join/${pendingInviteCode}`, { replace: true });
      }, 600);
    } else {
      navigate('/welcome');
    }
  }

  async function handleGoogleSignUp() {
    setError('');
    const { error: authError } = await signInWithGoogle();
    if (authError) {
      setError(authError.message);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-8">
        {/* Brand */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl" style={{ background: 'linear-gradient(135deg, hsl(152 68% 42%), hsl(84 60% 48%))' }}>
            <Sprout className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Create your account</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {pendingInviteCode ? 'Create an account to accept your team invite' : 'Get started with Grad Roots EventMap'}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="glass-panel p-6 space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Google OAuth */}
          <Button
            type="button"
            variant="outline"
            className="w-full gap-2"
            onClick={handleGoogleSignUp}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Continue with Google
          </Button>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">or create with email</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="signup-first">First name</Label>
              <Input
                id="signup-first"
                placeholder="Jane"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="signup-last">Last name</Label>
              <Input
                id="signup-last"
                placeholder="Smith"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="signup-email">Email</Label>
            <Input
              id="signup-email"
              type="email"
              placeholder="you@university.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="signup-role">Role</Label>
            <select
              id="signup-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className={selectClasses}
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="signup-password">Password</Label>
            <div className="relative">
              <Input
                id="signup-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Create a strong password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <PasswordStrength password={password} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="signup-confirm">Confirm password</Label>
            <Input
              id="signup-confirm"
              type={showPassword ? 'text' : 'password'}
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          <Button
            type="submit"
            className="w-full gap-2"
            disabled={!firstName.trim() || !lastName.trim() || !email.trim() || !password || !isPasswordValid(password) || password !== confirmPassword || submitting}
          >
            <UserPlus className="w-4 h-4" />
            {submitting ? 'Creating account...' : 'Create account'}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link to="/sign-in" className="text-primary font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
