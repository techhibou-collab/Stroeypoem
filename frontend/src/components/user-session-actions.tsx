'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { clearUserSession, getStoredUser, getUserToken } from '@/lib/user-auth';

type UserSessionActionsProps = {
  showLogin?: boolean;
  loginHref?: string;
  className?: string;
};

export default function UserSessionActions({
  showLogin = true,
  loginHref = '/login',
  className = '',
}: UserSessionActionsProps) {
  const router = useRouter();
  const [isMounted, setIsMounted] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState('');

  useEffect(() => {
    const token = getUserToken();
    const user = getStoredUser();

    setIsLoggedIn(Boolean(token));
    setUserName(user?.name || '');
    setIsMounted(true);
  }, []);

  const handleLogout = () => {
    clearUserSession();
    setIsLoggedIn(false);
    setUserName('');
    router.replace('/');
    router.refresh();
  };

  if (!isMounted) {
    return <div className={className} />;
  }

  if (!isLoggedIn) {
    if (!showLogin) {
      return <div className={className} />;
    }

    return (
      <div className={className}>
        <Link
          href={loginHref}
          className="rounded-full border border-[#e8dfd5] px-4 py-2 text-sm font-bold uppercase tracking-widest text-[#8a735c] transition-colors hover:bg-[#f7f3ec]"
        >
          Login
        </Link>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {userName ? (
        <span className="hidden rounded-full bg-[#f7f3ec] px-4 py-2 text-xs font-bold uppercase tracking-[0.24em] text-[#8a735c] sm:inline-flex">
          {userName}
        </span>
      ) : null}
      <button
        type="button"
        onClick={handleLogout}
        className="rounded-full border border-[#e8dfd5] px-4 py-2 text-sm font-bold uppercase tracking-widest text-[#8a735c] transition-colors hover:bg-[#f7f3ec]"
      >
        Logout
      </button>
    </div>
  );
}
