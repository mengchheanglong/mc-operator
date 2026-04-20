'use client';

import { codeGraph } from '@/features/code-graph/api';
import { useState } from 'react';
import { Database } from 'lucide-react';

export default function CodeGraphPage() {
  const [indexing, setIndexing] = useState(false);

  const handleIndex = async () => {
    setIndexing(true);
    try {
      await codeGraph.index();
      alert('Indexing started!');
    } catch (error) {
      alert('Failed to start indexing');
    } finally {
      setIndexing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Code Graph</h2>
        
        <button
          onClick={handleIndex}
          disabled={indexing}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
        >
          <Database className="w-4 h-4" />
          {indexing ? 'Indexing...' : 'Trigger Index'}
        </button>
      </div>
    </div>
  );
}
