'use client';

import { context } from '@/features/context/api';
import { Download } from 'lucide-react';

export default function ContextPage() {
  const handleExport = async () => {
    try {
      const data = await context.export();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'context-export.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      alert('Failed to export context');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Context Export</h2>
        
        <button
          onClick={handleExport}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <Download className="w-4 h-4" />
          Export Context Pack
        </button>
      </div>
    </div>
  );
}
