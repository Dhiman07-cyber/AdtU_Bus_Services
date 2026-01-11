/**
 * Empty State Component
 * Professional empty state for tables and lists
 */

import React from 'react';
import { FileText, Users, Bus, Route, Bell, UserCircle } from 'lucide-react';
import { Button } from './ui/button';

interface EmptyStateProps {
  icon?: 'file' | 'users' | 'bus' | 'route' | 'notification' | 'user';
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

const iconMap = {
  file: FileText,
  users: Users,
  bus: Bus,
  route: Route,
  notification: Bell,
  user: UserCircle
};

export function EmptyState({
  icon = 'file',
  title = "No data available",
  description = "Click 'Add New' to create one",
  actionLabel,
  onAction
}: EmptyStateProps) {
  const Icon = iconMap[icon];

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-6">
        <Icon className="h-10 w-10 text-gray-400 dark:text-gray-600" />
      </div>
      <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
        {title}
      </h3>
      <p className="text-gray-500 dark:text-gray-400 mb-6 text-center max-w-md">
        {description}
      </p>
      {actionLabel && onAction && (
        <Button
          onClick={onAction}
          className="bg-blue-600 hover:bg-blue-700 text-white rounded-full px-6 shadow-lg hover:shadow-xl transition-all"
        >
          {actionLabel}
        </Button>
      )}
    </div>
  );
}


