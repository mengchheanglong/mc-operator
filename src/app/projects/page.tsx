'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projects } from '@/features/projects/api';
import { useAppState } from '@/state/app-store';
import { Check, FolderOpen } from 'lucide-react';
import { useEffect } from 'react';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingState,
  PageContainer,
  PageHeader,
  StatusBadge,
  cn,
} from '@/components/ui/primitives';
import { toast } from '@/components/ui/toast';

interface Project {
  id: string;
  name?: string;
  description?: string;
}

export default function ProjectsPage() {
  const queryClient = useQueryClient();
  const { activeProject, setActiveProject } = useAppState();

  const { data, isLoading, error, refetch } = useQuery({
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
    onSuccess: (payload: { activeProject?: { id?: string; name?: string } }) => {
      const backendActiveProjectId = payload?.activeProject?.id;
      if (typeof backendActiveProjectId === 'string' && backendActiveProjectId) {
        setActiveProject(backendActiveProjectId);
        toast.success('Project activated', payload?.activeProject?.name);
      }
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: () => toast.error('Failed to activate project'),
  });

  if (isLoading) {
    return (
      <PageContainer>
        <LoadingState label="Loading projects..." />
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer>
        <ErrorState
          title="Failed to load projects"
          message={error.message}
          onRetry={() => refetch()}
        />
      </PageContainer>
    );
  }

  const projectList = (data?.projects ?? []) as Project[];

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Workspace"
        title="Projects"
        description="Switch the active workspace. All queries scope to the selected project."
        actions={
          <StatusBadge tone="blue">
            {projectList.length} project{projectList.length === 1 ? '' : 's'}
          </StatusBadge>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 mc-stagger">
        {projectList.map((project) => {
          const isActive = project.id === activeProject;
          return (
            <Card
              key={project.id}
              as="article"
              interactive
              className={cn(
                'cursor-pointer',
                isActive && 'border-blue-300/30 ring-1 ring-blue-400/20',
              )}
            >
              <button
                type="button"
                onClick={() => activateMutation.mutate(project.id)}
                disabled={isActive || activateMutation.isPending}
                aria-label={`Activate project ${project.name || project.id}`}
                className="flex w-full items-start justify-between gap-3 p-4 text-left outline-none focus-visible:ring-4 focus-visible:ring-blue-400/20"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition',
                      isActive
                        ? 'border-blue-300/30 bg-blue-400/12 text-blue-200'
                        : 'border-white/10 bg-white/[0.05] text-slate-400',
                    )}
                  >
                    <FolderOpen className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold tracking-tight text-slate-100">
                      {project.name || project.id}
                    </h3>
                    {project.description && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                        {project.description}
                      </p>
                    )}
                  </div>
                </div>
                {isActive ? (
                  <Badge tone="blue">
                    <span className="inline-flex items-center gap-1">
                      <Check className="h-3 w-3" /> Active
                    </span>
                  </Badge>
                ) : (
                  <span className="shrink-0 text-xs font-semibold text-slate-600 transition group-hover:text-blue-300">
                    Activate
                  </span>
                )}
              </button>
            </Card>
          );
        })}

        {projectList.length === 0 && (
          <div className="col-span-full">
            <EmptyState
              icon={FolderOpen}
              title="No projects found"
              description="Create a project from the backend or workspace bootstrap to get started."
            />
          </div>
        )}
      </div>
    </PageContainer>
  );
}
