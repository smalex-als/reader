import type { ComponentProps } from 'react';
import Toolbar from '@/components/Toolbar';

type ToolbarProps = ComponentProps<typeof Toolbar>;

interface AppSidebarProps {
  toolbarProps: ToolbarProps;
}

export default function AppSidebar({ toolbarProps }: AppSidebarProps) {
  return (
    <aside className="sidebar">
      <Toolbar {...toolbarProps} />
    </aside>
  );
}
