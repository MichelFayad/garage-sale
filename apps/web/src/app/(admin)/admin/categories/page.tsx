import type { Metadata } from 'next';
import { CategoriesClient } from './CategoriesClient';

export const metadata: Metadata = { title: 'Categories · Admin' };

export default function AdminCategoriesPage() {
  return <CategoriesClient />;
}
