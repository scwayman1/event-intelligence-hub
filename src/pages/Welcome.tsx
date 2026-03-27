import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sprout, Building2, ArrowRight, Sparkles, Package, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useEventStore } from '@/data/store';

const PRESET_COLORS = [
  'hsl(152 55% 48%)', // green (default)
  'hsl(220 65% 52%)', // blue
  'hsl(280 60% 55%)', // purple
  'hsl(350 65% 52%)', // red
  'hsl(25 85% 55%)',  // orange
  'hsl(45 90% 50%)',  // gold
];

const ROLE_OPTIONS = [
  'Event Planner',
  'Development Officer',
  'Director of Events',
  'Coordinator',
  'Administrator',
  'Volunteer Lead',
  'Other',
];

export default function Welcome() {
  const navigate = useNavigate();
  const addOrganization = useEventStore((s) => s.addOrganization);
  const setActiveOrg = useEventStore((s) => s.setActiveOrg);
  const loadSampleData = useEventStore((s) => s.loadSampleData);
  const setUserProfile = useEventStore((s) => s.setUserProfile);

  const [step, setStep] = useState<'profile' | 'choose' | 'create-org'>('profile');

  // Profile fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('Event Planner');

  // Org fields
  const [orgName, setOrgName] = useState('');
  const [shortName, setShortName] = useState('');
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0]);

  function handleSaveProfile() {
    if (!firstName.trim() || !lastName.trim() || !email.trim()) return;
    setUserProfile({
      id: `user-${crypto.randomUUID().slice(0, 8)}`,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      role,
      createdAt: new Date().toISOString(),
    });
    setStep('choose');
  }

  function handleCreateOrg() {
    if (!orgName.trim()) return;
    const id = `org-${crypto.randomUUID().slice(0, 8)}`;
    addOrganization({
      id,
      name: orgName.trim(),
      shortName: shortName.trim() || orgName.trim().slice(0, 3).toUpperCase(),
      primaryColor: selectedColor,
      createdAt: new Date().toISOString(),
    });
    setActiveOrg(id);
    navigate('/');
  }

  function handleLoadSample() {
    loadSampleData();
    navigate('/');
  }

  const selectClasses = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-8">
        {/* Brand */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl" style={{ background: 'linear-gradient(135deg, hsl(152 68% 42%), hsl(84 60% 48%))' }}>
            <Sprout className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground tracking-tight">Grad Roots EventMap</h1>
            <p className="text-muted-foreground mt-1">Plan layouts, manage guests, and coordinate seating for your events.</p>
          </div>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2">
          {['Profile', 'Organization'].map((label, i) => {
            const stepIndex = step === 'profile' ? 0 : 1;
            const isActive = i === stepIndex;
            const isDone = i < stepIndex;
            return (
              <div key={label} className="flex items-center gap-2">
                {i > 0 && <div className={`w-8 h-px ${isDone ? 'bg-primary' : 'bg-border'}`} />}
                <div className="flex items-center gap-1.5">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                    isActive ? 'bg-primary text-primary-foreground' : isDone ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                  }`}>
                    {isDone ? '\u2713' : i + 1}
                  </div>
                  <span className={`text-xs font-medium ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>{label}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Step 1: Profile */}
        {step === 'profile' && (
          <div className="glass-panel p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <User className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Set up your profile</h2>
                <p className="text-sm text-muted-foreground">Tell us who you are so your work is saved to your account.</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="profile-first">First name</Label>
                  <Input
                    id="profile-first"
                    placeholder="Jane"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-last">Last name</Label>
                  <Input
                    id="profile-last"
                    placeholder="Smith"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="profile-email">Email</Label>
                <Input
                  id="profile-email"
                  type="email"
                  placeholder="jane@university.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="profile-role">Role</Label>
                <select
                  id="profile-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className={selectClasses}
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            </div>

            <Button
              onClick={handleSaveProfile}
              disabled={!firstName.trim() || !lastName.trim() || !email.trim()}
              className="w-full gap-2"
            >
              Continue
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        )}

        {/* Step 2: Choose path */}
        {step === 'choose' && (
          <div className="space-y-4">
            <button
              onClick={() => setStep('create-org')}
              className="w-full glass-panel p-5 text-left hover:border-primary/40 transition-all group"
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                  <Building2 className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground">Create your organization</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">Set up your school or institution to start planning events.</p>
                </div>
                <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors mt-0.5" />
              </div>
            </button>

            <button
              onClick={handleLoadSample}
              className="w-full glass-panel p-5 text-left hover:border-primary/40 transition-all group"
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 group-hover:bg-accent/20 transition-colors">
                  <Package className="w-5 h-5 text-accent" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground">Explore with sample data</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">Load two demo schools with events, guests, and seating rules to see the platform in action.</p>
                </div>
                <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors mt-0.5" />
              </div>
            </button>

            <p className="text-center text-xs text-muted-foreground pt-2">
              <Sparkles className="w-3 h-3 inline mr-1" />
              All data is stored locally in your browser and tied to your profile.
            </p>
          </div>
        )}

        {/* Step 2b: Create org */}
        {step === 'create-org' && (
          <div className="glass-panel p-6 space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Set up your organization</h2>
              <p className="text-sm text-muted-foreground mt-0.5">This is the school or institution whose events you'll be managing.</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="org-name">Organization name</Label>
                <Input
                  id="org-name"
                  placeholder="e.g. Greenfield University"
                  value={orgName}
                  onChange={(e) => {
                    setOrgName(e.target.value);
                    if (!shortName || shortName === orgName.slice(0, 3).toUpperCase()) {
                      setShortName(e.target.value.slice(0, 3).toUpperCase());
                    }
                  }}
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="short-name">Short name / abbreviation</Label>
                <Input
                  id="short-name"
                  placeholder="e.g. GFU"
                  maxLength={5}
                  value={shortName}
                  onChange={(e) => setShortName(e.target.value.toUpperCase())}
                />
              </div>

              <div className="space-y-2">
                <Label>Brand color</Label>
                <div className="flex gap-2">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setSelectedColor(color)}
                      className="w-8 h-8 rounded-full border-2 transition-all"
                      style={{
                        background: color,
                        borderColor: selectedColor === color ? 'hsl(var(--foreground))' : 'transparent',
                        transform: selectedColor === color ? 'scale(1.15)' : 'scale(1)',
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setStep('choose')} className="flex-1">
                Back
              </Button>
              <Button onClick={handleCreateOrg} disabled={!orgName.trim()} className="flex-1 gap-2">
                Create & get started
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
