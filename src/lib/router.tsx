import { useEffect, useState } from 'react';
import type { CSSProperties, MouseEvent, ReactNode } from 'react';

export function getHashPath(): string {
  const h = window.location.hash.replace(/^#/, '');
  return h.startsWith('/') ? h.slice(1) : h;
}

export function navigate(path: string) {
  window.location.hash = path ? `/${path}` : '/';
}

export function useHashRoute(): string {
  const [path, setPath] = useState(getHashPath());
  useEffect(() => {
    const onChange = () => setPath(getHashPath());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return path;
}

export function useHashSegments(): string[] {
  const path = useHashRoute();
  return path.split('/').filter(Boolean);
}

export function matchRoute(path: string): { page: string; id?: string; sub?: string } {
  const seg = path.split('/').filter(Boolean);
  return { page: seg[0] ?? 'login', id: seg[1], sub: seg[2] };
}

interface LinkProps {
  to: string;
  children: ReactNode;
  className?: string;
  title?: string;
  onNavigate?: () => void;
  ariaLabel?: string;
  style?: CSSProperties;
}

export function Link({ to, children, className, title, onNavigate, ariaLabel, style }: LinkProps) {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    onNavigate?.();
  };
  return (
    <a
      href={`#/${to}`}
      className={className}
      title={title}
      aria-label={ariaLabel}
      style={style}
      onClick={onClick}
    >
      {children}
    </a>
  );
}

export function useReducedMotion(): boolean {
  const [rm, setRm] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setRm(mq.matches);
    const fn = (e: MediaQueryListEvent) => setRm(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return rm;
}