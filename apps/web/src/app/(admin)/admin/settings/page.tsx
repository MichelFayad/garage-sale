import type { Metadata } from 'next';
import { SettingsClient } from './SettingsClient';

export const metadata: Metadata = { title: 'Settings · Admin' };

export default function AdminSettingsPage() {
  return <SettingsClient />;
}
