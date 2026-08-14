import { redirect } from 'next/navigation';

export default function ApplicationsIndexPage() {
  redirect('/applications/registry');
}
