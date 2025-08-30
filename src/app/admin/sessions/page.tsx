'use client';

import { useState, useEffect } from 'react';
import { useAdminAuth } from '@/lib/admin-auth-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Monitor, 
  Smartphone, 
  Tablet, 
  Globe, 
  Shield, 
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Clock
} from 'lucide-react';
import type { AdminSession } from '@/lib/admin-auth-context';

export default function SessionsPage() {
  const { getSessions, revokeSessions } = useAdminAuth();
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      setLoading(true);
      const sessionData = await getSessions();
      setSessions(sessionData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    try {
      setRevoking(prev => [...prev, sessionId]);
      await revokeSessions([sessionId]);
      setSuccess('Session revoked successfully');
      await loadSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke session');
    } finally {
      setRevoking(prev => prev.filter(id => id !== sessionId));
    }
  };

  const handleRevokeAllSessions = async () => {
    try {
      setRevoking(['all']);
      await revokeSessions(undefined, true);
      setSuccess('All other sessions revoked successfully');
      await loadSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke sessions');
    } finally {
      setRevoking([]);
    }
  };

  const getDeviceIcon = (deviceInfo: string) => {
    const info = deviceInfo.toLowerCase();
    if (info.includes('mobile') || info.includes('android') || info.includes('iphone')) {
      return <Smartphone className="h-4 w-4" />;
    }
    if (info.includes('tablet') || info.includes('ipad')) {
      return <Tablet className="h-4 w-4" />;
    }
    return <Monitor className="h-4 w-4" />;
  };

  const formatLastActivity = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  const getSessionStatus = (session: AdminSession) => {
    const lastActivity = new Date(session.lastActivity);
    const now = new Date();
    const diffMinutes = (now.getTime() - lastActivity.getTime()) / 60000;

    if (session.isCurrent) {
      return { status: 'current', color: 'bg-green-100 text-green-800', label: 'Current Session' };
    }
    if (diffMinutes < 30) {
      return { status: 'active', color: 'bg-blue-100 text-blue-800', label: 'Active' };
    }
    if (diffMinutes < 60 * 24) {
      return { status: 'idle', color: 'bg-yellow-100 text-yellow-800', label: 'Idle' };
    }
    return { status: 'inactive', color: 'bg-gray-100 text-gray-800', label: 'Inactive' };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Session Management</h1>
          <p className="text-gray-600">Manage your active admin sessions</p>
        </div>
        <Button
          onClick={handleRevokeAllSessions}
          disabled={revoking.includes('all') || sessions.filter(s => !s.isCurrent).length === 0}
          variant="destructive"
        >
          {revoking.includes('all') ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              Revoking...
            </>
          ) : (
            <>
              <Trash2 className="h-4 w-4 mr-2" />
              Revoke All Other Sessions
            </>
          )}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      {/* Security Notice */}
      <Alert>
        <Shield className="h-4 w-4" />
        <AlertDescription>
          For security, regularly review and revoke sessions you don't recognize. 
          Sessions are automatically revoked after 30 days of inactivity.
        </AlertDescription>
      </Alert>

      {/* Sessions List */}
      <div className="grid gap-4">
        {sessions.length === 0 ? (
          <Card>
            <CardContent className="flex items-center justify-center py-8">
              <div className="text-center">
                <Globe className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-500">No active sessions found</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          sessions.map((session) => {
            const status = getSessionStatus(session);
            return (
              <Card key={session.id} className={session.isCurrent ? 'ring-2 ring-primary' : ''}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {getDeviceIcon(session.deviceInfo)}
                      <div>
                        <CardTitle className="text-base">{session.deviceInfo}</CardTitle>
                        <CardDescription className="flex items-center space-x-2">
                          <span>{session.ipAddress}</span>
                          <span>•</span>
                          <span>Created {new Date(session.createdAt).toLocaleDateString()}</span>
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge className={status.color}>
                        {status.label}
                      </Badge>
                      {!session.isCurrent && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleRevokeSession(session.id)}
                          disabled={revoking.includes(session.id)}
                        >
                          {revoking.includes(session.id) ? (
                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                          ) : (
                            <Trash2 className="h-3 w-3" />
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between text-sm text-gray-600">
                    <div className="flex items-center space-x-1">
                      <Clock className="h-3 w-3" />
                      <span>Last activity: {formatLastActivity(session.lastActivity)}</span>
                    </div>
                    {session.isCurrent && (
                      <Badge variant="outline" className="text-xs">
                        This device
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Session Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sessions.length}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {sessions.filter(s => {
                const diffMinutes = (new Date().getTime() - new Date(s.lastActivity).getTime()) / 60000;
                return diffMinutes < 30;
              }).length}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Idle Sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {sessions.filter(s => {
                const diffMinutes = (new Date().getTime() - new Date(s.lastActivity).getTime()) / 60000;
                return diffMinutes >= 30 && diffMinutes < 60 * 24;
              }).length}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}