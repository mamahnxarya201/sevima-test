import React from 'react';

export const MaterialIcon = ({ icon, className = "" }: { icon: string, className?: string }) => (
  <span className={`material-symbols-outlined ${className}`} style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>
    {icon}
  </span>
);
