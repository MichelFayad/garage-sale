import type { Metadata } from 'next';
import { StaffClient } from './StaffClient';

export const metadata: Metadata = { title: 'Staff · Admin' };

export default function AdminStaffPage() {
  return <StaffClient />;
}
