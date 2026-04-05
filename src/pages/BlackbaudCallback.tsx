import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { exchangeCode } from '@/services/blackbaud-auth';

type CallbackState = 'processing' | 'success' | 'error';

export default function BlackbaudCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState<CallbackState>('processing');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const code = searchParams.get('code');
    const oauthState = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDesc = searchParams.get('error_description');

    if (error) {
      setState('error');
      setErrorMessage(errorDesc || error || 'Authorization was denied');
      toast.error(`Blackbaud authorization failed: ${errorDesc || error}`);
      return;
    }

    if (!code || !oauthState) {
      setState('error');
      setErrorMessage('Missing authorization code or state. Please try connecting again.');
      return;
    }

    // Exchange the code for tokens
    exchangeCode(code, oauthState).then((result) => {
      if (result.success) {
        setState('success');
        toast.success('Blackbaud connected successfully!');
        // Redirect back to integrations page after a brief delay
        setTimeout(() => {
          // Try to get the last visited event's integrations page
          const lastEventId = sessionStorage.getItem('bb_callback_event_id');
          sessionStorage.removeItem('bb_callback_event_id');
          if (lastEventId) {
            navigate(`/events/${lastEventId}/integrations`, { replace: true });
          } else {
            navigate('/', { replace: true });
          }
        }, 1500);
      } else {
        setState('error');
        setErrorMessage(result.error || 'Token exchange failed');
        toast.error(result.error || 'Connection failed');
      }
    });
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md w-full mx-auto p-8 text-center space-y-4">
        {state === 'processing' && (
          <>
            <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto" />
            <h2 className="text-xl font-semibold text-foreground">Connecting to Blackbaud...</h2>
            <p className="text-sm text-muted-foreground">
              Exchanging authorization code for access tokens. This will only take a moment.
            </p>
          </>
        )}

        {state === 'success' && (
          <>
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
            <h2 className="text-xl font-semibold text-foreground">Connected!</h2>
            <p className="text-sm text-muted-foreground">
              Your Blackbaud account is now linked. Redirecting you back...
            </p>
          </>
        )}

        {state === 'error' && (
          <>
            <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
            <h2 className="text-xl font-semibold text-foreground">Connection Failed</h2>
            <p className="text-sm text-muted-foreground">{errorMessage}</p>
            <button
              onClick={() => navigate(-1)}
              className="mt-4 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
            >
              Go Back
            </button>
          </>
        )}
      </div>
    </div>
  );
}
