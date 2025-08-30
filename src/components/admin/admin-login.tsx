'use client';

import { useState, useEffect } from 'react';
import { useAdminAuth } from '@/lib/admin-auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { 
  Shield, 
  AlertTriangle, 
  Eye, 
  EyeOff, 
  Clock,
  CheckCircle2
} from 'lucide-react';

interface LoginAttempt {
  timestamp: Date;
  success: boolean;
  ipAddress?: string;
}

export function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rateLimitInfo, setRateLimitInfo] = useState<{
    blocked: boolean;
    retryAfter?: number;
    attempts?: number;
  }>({ blocked: false });
  const [loginAttempts, setLoginAttempts] = useState<LoginAttempt[]>([]);
  
  const { login } = useAdminAuth();

  // Load previous login attempts from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('admin_login_attempts');
    if (stored) {
      try {
        const attempts = JSON.parse(stored).map((a: any) => ({
          ...a,
          timestamp: new Date(a.timestamp)
        }));
        setLoginAttempts(attempts);
      } catch (error) {
        console.error('Failed to parse login attempts:', error);
      }
    }
  }, []);

  const saveLoginAttempt = (success: boolean) => {
    const attempt: LoginAttempt = {
      timestamp: new Date(),
      success,
      ipAddress: 'hidden' // We don't store IP on client side
    };
    
    const newAttempts = [attempt, ...loginAttempts].slice(0, 10); // Keep last 10 attempts
    setLoginAttempts(newAttempts);
    localStorage.setItem('admin_login_attempts', JSON.stringify(newAttempts));
  };

  const getDeviceFingerprint = () => {
    // Simple device fingerprinting
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx?.fillText('fingerprint', 10, 10);
    const fingerprint = canvas.toDataURL();
    
    return btoa(
      navigator.userAgent + 
      navigator.language + 
      screen.width + 
      screen.height + 
      fingerprint.slice(-50)
    ).slice(0, 32);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setRateLimitInfo({ blocked: false });

    try {
      const deviceInfo = `${navigator.platform} - ${navigator.userAgent.split(' ')[0]}`;
      
      await login(email, password, { 
        rememberMe,
        deviceInfo
      });
      
      saveLoginAttempt(true);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Login failed';
      setError(errorMessage);
      saveLoginAttempt(false);
      
      // Handle rate limiting
      if (errorMessage.includes('Too many login attempts')) {
        setRateLimitInfo({ 
          blocked: true,
          retryAfter: Date.now() + 15 * 60 * 1000 // 15 minutes
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const formatTimeRemaining = (retryAfter: number) => {
    const remaining = Math.max(0, retryAfter - Date.now());
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const recentFailedAttempts = loginAttempts.filter(
    a => !a.success && Date.now() - a.timestamp.getTime() < 60 * 60 * 1000 // Last hour
  ).length;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto h-12 w-12 flex items-center justify-center rounded-full bg-primary">
            <Shield className="h-6 w-6 text-white" />
          </div>
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            Admin Portal
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Secure access to restaurant management
          </p>
        </div>

        {/* Security Warnings */}
        {recentFailedAttempts > 0 && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {recentFailedAttempts} failed login attempt{recentFailedAttempts > 1 ? 's' : ''} in the last hour.
            </AlertDescription>
          </Alert>
        )}

        {rateLimitInfo.blocked && rateLimitInfo.retryAfter && (
          <Alert variant="destructive">
            <Clock className="h-4 w-4" />
            <AlertDescription>
              Too many failed attempts. Please try again in {formatTimeRemaining(rateLimitInfo.retryAfter)}.
            </AlertDescription>
          </Alert>
        )}

        {/* Login Form */}
        <Card>
          <CardHeader>
            <CardTitle>Sign In</CardTitle>
            <CardDescription>
              Enter your admin credentials to access the dashboard
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1"
                  disabled={loading || rateLimitInfo.blocked}
                />
              </div>
              
              <div>
                <Label htmlFor="password">Password</Label>
                <div className="relative mt-1">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading || rateLimitInfo.blocked}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-gray-400" />
                    ) : (
                      <Eye className="h-4 w-4 text-gray-400" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
                />
                <Label htmlFor="remember-me" className="ml-2 text-sm">
                  Keep me signed in for 30 days
                </Label>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button
                type="submit"
                disabled={loading || rateLimitInfo.blocked}
                className="w-full"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Signing in...
                  </>
                ) : (
                  'Sign in'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Recent Login Attempts */}
        {loginAttempts.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {loginAttempts.slice(0, 3).map((attempt, index) => (
                  <div key={index} className="flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-2">
                      {attempt.success ? (
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                      ) : (
                        <AlertTriangle className="h-3 w-3 text-red-500" />
                      )}
                      <span className={attempt.success ? 'text-green-700' : 'text-red-700'}>
                        {attempt.success ? 'Successful login' : 'Failed login'}
                      </span>
                    </div>
                    <span className="text-gray-500">
                      {attempt.timestamp.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Security Notice */}
        <div className="text-center">
          <p className="text-xs text-gray-500">
            This is a secure admin portal. All login attempts are logged and monitored.
          </p>
        </div>
      </div>
    </div>
  );
}