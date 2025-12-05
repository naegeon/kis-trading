'use client';

import { signOut } from 'next-auth/react';

const Button = ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props} className="bg-red-500 text-white py-2 px-4 rounded-md hover:bg-red-600 transition-colors">
      {children}
    </button>
  );

export function SignOutButton() {
  return <Button onClick={() => signOut({ callbackUrl: '/login' })}>Sign Out</Button>;
}
