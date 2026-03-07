import { motion } from 'framer-motion';

interface BrandLogoProps {
  collapsed?: boolean;
}

export function BrandLogo({ collapsed }: BrandLogoProps) {
  return (
    <div className="relative flex items-center justify-center w-8 h-8 shrink-0">
      {/* Background ambient glow */}
      <div className="absolute inset-0 rounded-lg opacity-60 mix-blend-screen blur-[6px]"
           style={{ background: 'var(--color-primary-glow)' }} />
      
      {/* Glassmorphic base */}
      <div className="absolute inset-0 rounded-lg border shadow-inner backdrop-blur-md"
           style={{
             background: 'linear-gradient(135deg, rgba(8, 145, 178, 0.4), rgba(6, 182, 212, 0.1))',
             borderColor: 'var(--color-glass-border-strong)',
           }} />

      {/* The Super Symbol (Modern Amphitheater / Nexus) */}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="relative z-10 w-5 h-5 text-white"
        style={{ filter: 'drop-shadow(0 0 2px rgba(255,255,255,0.5))' }}
      >
        {/* Animated Ascend Lines */}
        <motion.path
          d="M12 21V11"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.5, ease: 'easeOut', repeat: Infinity, repeatType: 'reverse', repeatDelay: 2 }}
        />
        <motion.path
          d="M7 21V15"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.5, ease: 'easeOut', delay: 0.2, repeat: Infinity, repeatType: 'reverse', repeatDelay: 2 }}
        />
        <motion.path
          d="M17 21V15"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.5, ease: 'easeOut', delay: 0.4, repeat: Infinity, repeatType: 'reverse', repeatDelay: 2 }}
        />
        {/* Core Nexus Sphere */}
        <circle cx="12" cy="7" r="3" fill="currentColor" />
      </svg>
    </div>
  );
}
