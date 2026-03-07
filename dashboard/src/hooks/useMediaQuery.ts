import { useEffect, useState } from 'react';

function getMatch(query: string): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(query).matches;
}

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => getMatch(query));

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const handleChange = () => setMatches(mediaQuery.matches);

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [query]);

  return matches;
}
