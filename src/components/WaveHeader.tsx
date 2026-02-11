import React from 'react';

interface WaveHeaderProps {
  title: string;
  subtitle?: string;
}

const WaveHeader: React.FC<WaveHeaderProps> = ({ title, subtitle }) => {
  return (
    <div className="wave-header relative pb-12">
      <div className="px-6 pt-12 pb-4">
        <h1 className="text-3xl font-bold font-display">{title}</h1>
        {subtitle && (
          <p className="mt-1 text-sm opacity-80">{subtitle}</p>
        )}
      </div>
      <svg
        className="absolute bottom-0 left-0 w-full"
        viewBox="0 0 400 40"
        preserveAspectRatio="none"
        style={{ height: '40px' }}
      >
        <path
          d="M0,20 Q100,40 200,20 Q300,0 400,20 L400,40 L0,40 Z"
          fill="hsl(var(--background))"
        />
      </svg>
    </div>
  );
};

export default WaveHeader;
