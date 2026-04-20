'use client';

import { workspace } from '@/features/workspace/api';
import { useState } from 'react';
import { Settings } from 'lucide-react';

export default function WorkspaceBootstrapPage() {
  const [bootstrapping, setBootstrapping] = useState(false);

  const handleBootstrap = async () => {
    setBootstrapping(true);
    try {
      await workspace.bootstrap();
      alert('Workspace bootstrapped successfully!');
    } catch (error) {
      alert('Failed to bootstrap workspace');
    } finally {
      setBootstrapping(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Workspace Bootstrap</h2>
        
        <button
          onClick={handleBootstrap}
          disabled={bootstrapping}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
        >
          <Settings className="w-4 h-4" />
          {bootstrapping ? 'Bootstrapping...' : 'Bootstrap Workspace'}
        </button>
      </div>
    </div>
  );
}
