import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User,
  Save,
  Eye,
  EyeOff,
  Lock,
  LogOut,
  Monitor,
  AlertTriangle,
  Check,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuthContext } from '@/contexts/AuthContext';
import { useEventStore } from '@/data/store';
import { toast } from 'sonner';

function PasswordRequirement({ met, label }: { met: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      {met ? (
        <Check className="w-3 h-3 text-success shrink-0" />
      ) : (
        <X className="w-3 h-3 text-muted-foreground shrink-0" />
      )}
      <span className={met ? 'text-success' : 'text-muted-foreground'}>{label}</span>
    </div>
  );
}

export default function Profile() {
  const navigate = useNavigate();
  const { user, signOut } = useAuthContext();
  const userProfile = useEventStore((s) => s.userProfile);
  const setUserProfile = useEventStore((s) => s.setUserProfile);

  // Profile fields — sync from store when userProfile loads async
  const [firstName, setFirstName] = useState(userProfile?.firstName ?? '');
  const [lastName, setLastName] = useState(userProfile?.lastName ?? '');
  useEffect(() => {
    if (userProfile?.firstName && !firstName) setFirstName(userProfile.firstName);
    if (userProfile?.lastName && !lastName) setLastName(userProfile.lastName);
  }, [userProfile?.firstName, userProfile?.lastName]); // eslint-disable-line react-hooks/exhaustive-deps
  const [savingProfile, setSavingProfile] = useState(false);

  // Password fields
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  // Signing out state
  const [signingOut, setSigningOut] = useState(false);
  const [signingOutAll, setSigningOutAll] = useState(false);

  // Password strength checks
  const passwordChecks = useMemo(() => {
    return {
      minLength: newPassword.length >= 8,
      uppercase: /[A-Z]/.test(newPassword),
      lowercase: /[a-z]/.test(newPassword),
      number: /[0-9]/.test(newPassword),
      special: /[^A-Za-z0-9]/.test(newPassword),
    };
  }, [newPassword]);

  const allPasswordChecksMet = Object.values(passwordChecks).every(Boolean);
  const passwordsMatch = newPassword === confirmPassword && confirmPassword.length > 0;

  const initials = `${(userProfile?.firstName ?? '').charAt(0)}${(userProfile?.lastName ?? '').charAt(0)}`.toUpperCase();

  const signedInSince = user?.created_at
    ? new Date(user.last_sign_in_at ?? user.created_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'Unknown';

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      toast.error('First name and last name are required.');
      return;
    }

    setSavingProfile(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: { first_name: firstName.trim(), last_name: lastName.trim() },
      });

      if (error) {
        toast.error(error.message);
      } else {
        if (userProfile) {
          setUserProfile({
            ...userProfile,
            firstName: firstName.trim(),
            lastName: lastName.trim(),
          });
        }
        toast.success('Profile updated successfully.');
      }
    } catch {
      toast.error('Failed to update profile. Please try again.');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault();

    if (!allPasswordChecksMet) {
      toast.error('Password does not meet all requirements.');
      return;
    }

    if (!passwordsMatch) {
      toast.error('Passwords do not match.');
      return;
    }

    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });

      if (error) {
        toast.error(error.message);
      } else {
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        toast.success('Password updated successfully.');
      }
    } catch {
      toast.error('Failed to update password. Please try again.');
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
      navigate('/sign-in');
    } catch {
      toast.error('Sign out failed. Please try again.');
      setSigningOut(false);
    }
  }

  async function handleSignOutAll() {
    setSigningOutAll(true);
    try {
      const { error } = await supabase.auth.signOut({ scope: 'global' });
      if (error) {
        toast.error(error.message);
      } else {
        navigate('/sign-in');
      }
    } catch {
      toast.error('Failed to sign out. Please try again.');
    } finally {
      setSigningOutAll(false);
    }
  }

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Profile & Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your account details and preferences
        </p>
      </div>

      <div className="space-y-8">
        {/* ── Profile Information ── */}
        <section className="glass-panel p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">Profile Information</h3>
          <form onSubmit={handleSaveProfile} className="space-y-4">
            {/* Avatar */}
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-primary/15 flex items-center justify-center shrink-0 border-2 border-primary/30">
                {initials ? (
                  <span className="text-lg font-bold text-primary">{initials}</span>
                ) : (
                  <User className="w-6 h-6 text-primary" />
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {userProfile?.firstName} {userProfile?.lastName}
                </p>
                <p className="text-xs text-muted-foreground">
                  Avatar upload coming soon
                </p>
              </div>
            </div>

            {/* Name fields */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="profile-first-name">First name</Label>
                <Input
                  id="profile-first-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-last-name">Last name</Label>
                <Input
                  id="profile-last-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Last name"
                />
              </div>
            </div>

            {/* Email (read-only) */}
            <div className="space-y-2">
              <Label htmlFor="profile-email">Email</Label>
              <Input
                id="profile-email"
                type="email"
                value={userProfile?.email ?? ''}
                disabled
                className="bg-muted border-border opacity-70"
              />
              <p className="text-[11px] text-muted-foreground">
                Email changes are managed through your authentication provider.
              </p>
            </div>

            {/* Role (read-only) */}
            <div className="space-y-2">
              <Label htmlFor="profile-role">Role</Label>
              <Input
                id="profile-role"
                value={userProfile?.role ?? ''}
                disabled
                className="bg-muted border-border opacity-70 capitalize"
              />
            </div>

            <div className="flex justify-end pt-2">
              <Button
                type="submit"
                size="sm"
                className="gap-2"
                disabled={
                  savingProfile ||
                  !firstName.trim() ||
                  !lastName.trim() ||
                  (firstName.trim() === userProfile?.firstName &&
                    lastName.trim() === userProfile?.lastName)
                }
              >
                <Save className="w-4 h-4" />
                {savingProfile ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </section>

        {/* ── Change Password ── */}
        <section className="glass-panel p-6">
          <div className="flex items-center gap-2 mb-4">
            <Lock className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Change Password</h3>
          </div>
          <form onSubmit={handleUpdatePassword} className="space-y-4">
            {/* Current password */}
            <div className="space-y-2">
              <Label htmlFor="current-password">Current password</Label>
              <div className="relative">
                <Input
                  id="current-password"
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  autoComplete="current-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showCurrentPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* New password */}
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  autoComplete="new-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showNewPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Password strength indicator */}
            {newPassword.length > 0 && (
              <div className="rounded-md bg-muted/50 border border-border p-3 space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Password requirements
                </p>
                <PasswordRequirement met={passwordChecks.minLength} label="At least 8 characters" />
                <PasswordRequirement met={passwordChecks.uppercase} label="One uppercase letter" />
                <PasswordRequirement met={passwordChecks.lowercase} label="One lowercase letter" />
                <PasswordRequirement met={passwordChecks.number} label="One number" />
                <PasswordRequirement met={passwordChecks.special} label="One special character" />
              </div>
            )}

            {/* Confirm password */}
            <div className="space-y-2">
              <Label htmlFor="confirm-new-password">Confirm new password</Label>
              <Input
                id="confirm-new-password"
                type={showNewPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                autoComplete="new-password"
              />
              {confirmPassword.length > 0 && !passwordsMatch && (
                <p className="text-xs text-destructive">Passwords do not match.</p>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <Button
                type="submit"
                size="sm"
                className="gap-2"
                disabled={
                  savingPassword ||
                  !currentPassword ||
                  !allPasswordChecksMet ||
                  !passwordsMatch
                }
              >
                <Lock className="w-4 h-4" />
                {savingPassword ? 'Updating...' : 'Update Password'}
              </Button>
            </div>
          </form>
        </section>

        {/* ── Active Sessions ── */}
        <section className="glass-panel p-6">
          <div className="flex items-center gap-2 mb-4">
            <Monitor className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Active Sessions</h3>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground">Current session</p>
              <p className="text-xs text-muted-foreground">Signed in since: {signedInSince}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handleSignOutAll}
              disabled={signingOutAll}
            >
              <LogOut className="w-3.5 h-3.5" />
              {signingOutAll ? 'Signing out...' : 'Sign out all devices'}
            </Button>
          </div>
        </section>

        {/* ── Danger Zone ── */}
        <section className="glass-panel p-6 border-destructive/30">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            <h3 className="text-sm font-semibold text-destructive">Danger Zone</h3>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground">Sign out of your account</p>
              <p className="text-xs text-muted-foreground">
                You will need to sign in again to access your events.
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              className="gap-2"
              onClick={handleSignOut}
              disabled={signingOut}
            >
              <LogOut className="w-3.5 h-3.5" />
              {signingOut ? 'Signing out...' : 'Sign out'}
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
