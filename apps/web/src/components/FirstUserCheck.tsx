/**
 * First User Check Component
 * Checks if there are any users in the system and redirects to registration
 * page with special admin setup flow if this is the first user.
 */

import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { authApi } from '../lib/api-client';

interface FirstUserCheckProps {
  children: React.ReactNode;
}

export default function FirstUserCheck({ children }: FirstUserCheckProps) {
  const [isChecking, setIsChecking] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const checkFirstUser = async () => {
      try {
        const result = await authApi.checkFirstUser();
        
        // If no users exist and not already on register page, redirect to register
        if (result.is_first_user && location.pathname !== '/register') {
          navigate('/register', { replace: true });
        }
      } catch (error) {
        // If API fails, assume users exist and continue normally
        console.error('[FirstUserCheck] Failed to check first user:', error);
      } finally {
        setIsChecking(false);
      }
    };

    checkFirstUser();
  }, [location.pathname, navigate]);

  // Show loading spinner while checking
  if (isChecking) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-emerald-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-emerald-600 animate-spin" />
          <p className="text-gray-500">Initializing...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
