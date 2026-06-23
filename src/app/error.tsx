'use client';

import { ErrorState, PageContainer } from '@/components/ui/primitives';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <PageContainer>
      <ErrorState
        title="Something went wrong"
        message={error.message || error.digest || 'An unexpected error occurred while rendering this page.'}
        onRetry={reset}
      />
    </PageContainer>
  );
}
