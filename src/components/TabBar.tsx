import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Sun, Flame, BarChart3, Settings } from 'lucide-react';

const tabs = [
  { path: '/', label: 'Highlight', icon: Sun },
  { path: '/fogons', label: 'Fogones', icon: Flame },
  { path: '/reflect', label: 'Historial', icon: BarChart3 },
  { path: '/settings', label: 'Ajustes', icon: Settings },
];

interface TabBarProps {
  contentWidthClass?: string;
}

const TabBar: React.FC<TabBarProps> = ({ contentWidthClass = 'max-w-md' }) => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav className="tab-bar z-50">
      <div className={`flex items-center justify-around mx-auto ${contentWidthClass}`}>
        {tabs.map(tab => {
          const isActive = location.pathname === tab.path;
          const Icon = tab.icon;
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className={`tab-item flex-1 ${isActive ? 'tab-item-active' : ''}`}
            >
              <Icon size={22} strokeWidth={isActive ? 2.2 : 1.5} />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default TabBar;
