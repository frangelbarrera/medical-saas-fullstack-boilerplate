import React from 'react';
import * as LucideIcons from 'lucide-react';

interface IcoProps {
  name: keyof typeof LucideIcons;
  size?: number;
  color?: string;
  stroke?: number;
  style?: React.CSSProperties;
}

export const Ico: React.FC<IcoProps> = ({ name, size = 18, color = "rgba(255,255,255,0.55)", stroke = 1.7, style }) => {
  const IconComponent = LucideIcons[name] as React.ElementType;
  if (!IconComponent) return null;
  return <IconComponent size={size} color={color} strokeWidth={stroke} style={style} />;
};
