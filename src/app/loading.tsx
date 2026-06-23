import { LoadingState } from '@/components/ui/primitives';

export default function Loading() {
  return (
    <div className="px-4 py-6 lg:px-8">
      <LoadingState label="Loading..." />
    </div>
  );
}
