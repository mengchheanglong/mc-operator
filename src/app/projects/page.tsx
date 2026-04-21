'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projects } from '@/features/projects/api';
import { useAppState } from '@/state/app-store';
import { FolderOpen, Check } from 'lucide-react';
import { useEffect } from 'react';

export default function ProjectsPage() {
  const queryClient = useQueryClient();
  const { activeProject, setActiveProject } = useAppState();

  const { data, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: projects.list,
  });

  useEffect(() => {
    const backendActiveProjectId = data?.activeProject?.id;
    if (typeof backendActiveProjectId === 'string' && backendActiveProjectId !== activeProject) {
      setActiveProject(backendActiveProjectId);
    }
  }, [activeProject, data?.activeProject?.id, setActiveProject]);

  const activateMutation = useMutation({
    mutationFn: (id: string) => projects.activate(id),
    onSuccess: (payload: { activeProject?: { id?: string } }) => {
      const backendActiveProjectId = payload?.activeProject?.id;
      if (typeof backendActiveProjectId === 'string' && backendActiveProjectId) {
        setActiveProject(backendActiveProjectId);
      }
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  if (isLoading) {
    return <div className="text-gray-500">Loading projects...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Projects</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data?.projects?.map((project: any) => {
            const isActive = project.id === activeProject;
            return (
              <div
                key={project.id}
                className={`p-4 rounded-lg border-2 transition-all cursor-pointer ${
                  isActive
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
                onClick={() => activateMutation.mutate(project.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <FolderOpen
                      className={`w-6 h-6 ${
                        isActive ? 'text-blue-600' : 'text-gray-400'
                      }`}
                    />
                    <div>
                      <h3 className="font-semibold text-gray-900">{project.name || project.id}</h3>
                      {project.description && (
                        <p className="text-sm text-gray-600 mt-1">{project.description}</p>
                      )}
                    </div>
                  </div>
                  {isActive && <Check className="w-5 h-5 text-blue-600" />}
                </div>
              </div>
            );
          })}

          {data?.projects?.length === 0 && (
            <div className="col-span-full text-center py-8 text-gray-500">
              No projects found.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
