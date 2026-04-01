import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Sprout, Mail, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }

    setSubmitting(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/reset-password',
    });
    setSubmitting(false);

    if (resetError) {
      setError(resetError.message);
    } else {
      setSuccess(true);
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
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Reset your password</h1>
            <p className="text-sm text-muted-foreground mt-1">Enter your email and we'll send you a reset link</p>
          </div>
        </div>

        {success ? (
          <div className="glass-panel p-6 space-y-4">
            <div className="rounded-md bg-primary/10 border border-primary/30 px-3 py-2 text-sm text-primary">
              Check your email for a password reset link
            </div>
            <p className="text-sm text-muted-foreground text-center">
              Didn't receive the email? Check your spam folder or{' '}
              <button
                type="button"
                onClick={() => setSuccess(false)}
                className="text-primary font-medium hover:underline"
              >
                try again
              </button>
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="glass-panel p-6 space-y-4">
            {error && (
              <div role="alert" className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="forgot-email">Email</Label>
              <Input
                id="forgot-email"
                type="email"
                placeholder="you@university.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                autoComplete="email"
              />
            </div>

            <Button type="submit" className="w-full gap-2" disabled={!email.trim() || submitting}>
              <Mail className="w-4 h-4" />
              {submitting ? 'Sending...' : 'Send reset link'}
            </Button>
          </form>
        )}

        <p className="text-center text-sm text-muted-foreground">
          <Link to="/sign-in" className="inline-flex items-center gap-1 text-primary font-medium hover:underline">
            <ArrowLeft className="w-3 h-3" />
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
