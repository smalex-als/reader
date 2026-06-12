import { createContext, useContext, type ReactNode } from 'react';
import type { useReaderShellControls } from '@/hooks/useReaderShellControls';

type ReaderShellControls = ReturnType<typeof useReaderShellControls>;

const ReaderShellContext = createContext<ReaderShellControls | null>(null);

export function ReaderShellProvider({
  value,
  children
}: {
  value: ReaderShellControls;
  children: ReactNode;
}) {
  return (
    <ReaderShellContext.Provider value={value}>
      {children}
    </ReaderShellContext.Provider>
  );
}

export function useReaderShell() {
  const shell = useContext(ReaderShellContext);
  if (!shell) {
    throw new Error('useReaderShell must be used inside ReaderShellProvider');
  }
  return shell;
}
