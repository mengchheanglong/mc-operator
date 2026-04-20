'use client';

import { useQuery } from '@tanstack/react-query';
import { health } from '@/features/health/api';
import { useAppState } from '@/state/app-store';
import { useEffect } from 'react';
import { CheckCircle, XCircle, Database, Clock } from 'lucide-react';

export default function HealthPage() {
  const { setBackendConnected } = useAppState();
  
  const { data, isLoading, error } = useQuery({
    queryKey: ['health'],
    queryFn: health.check,
    refetchInterval: 10000, // Refetch every 10 seconds
  });

  useEffect(() => {
    setBackendConnected(!error);
  }, [error, setBackendConnected]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Checking backend health...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <XCircle className="w-8 h-8 text-red-500" />
          <h2 className="text-2xl font-bold text-gray-900">Backend Unreachable</h2>
        </div>
        <p className="text-gray-600">
          The backend server is not running. Start it with:{' '}
          <code className="bg-gray-100 px-2 py-1 rounded text-sm">npm run backend:dev</code>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <CheckCircle className="w-8 h-8 text-green-500" />
          <h2 className="text-2xl font-bold text-gray-900">Backend Health</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <span className="text-sm font-medium text-gray-600">Status</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {data?.ok ? 'Healthy' : 'Unhealthy'}
            </div>
          </div>

          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Database className="w-5 h-5 text-blue-600" />
              <span className="text-sm font-medium text-gray-600">Users</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">{data?.users || 0}</div>
          </div>

          <div className="p-4 bg-gray-50 rounded-lg md:col-span-2">
            <div className="flex items-center gap-2 mb-2">
              <Database className="w-5 h-5 text-purple-600" />
              <span className="text-sm font-medium text-gray-600">Database Path</span>
            </div>
            <div className="text-sm font-mono text-gray-900 break-all">{data?.dbPath}</div>
          </div>

          <div className="p-4 bg-gray-50 rounded-lg md:col-span-2">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-5 h-5 text-orange-600" />
              <span className="text-sm font-medium text-gray-600">Last Checked</span>
            </div>
            <div className="text-sm text-gray-900">
              {new Date(data?.timestamp).toLocaleString()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
