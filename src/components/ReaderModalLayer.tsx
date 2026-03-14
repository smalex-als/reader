import type { ComponentProps } from 'react';
import AppModals from '@/components/AppModals';

type AppModalsProps = ComponentProps<typeof AppModals>;

export default function ReaderModalLayer(props: AppModalsProps) {
  return <AppModals {...props} />;
}
