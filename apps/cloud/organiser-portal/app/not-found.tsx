import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex h-screen flex-col items-center justify-center">
      <h2 className="mb-4 text-4xl font-bold">404 - Not Found</h2>
      <p className="mb-4">Could not find requested resource</p>
      <Link href="/" className="text-[var(--pri)] hover:underline">
        Return Home
      </Link>
    </div>
  );
}
