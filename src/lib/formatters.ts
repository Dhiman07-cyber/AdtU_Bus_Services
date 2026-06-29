/**
 * Utility functions for formatting display values
 */

/**
 * Normalize route status to Active or Inactive
 */
export function normalizeRouteStatus(rawStatus: string | null | undefined): {
  label: string;
  variant: 'default' | 'secondary';
  tooltip?: string;
} {
  if (!rawStatus) {
    return { label: 'Active', variant: 'default' };
  }

  const status = rawStatus.toLowerCase();

  // Active states
  if (['active', 'enabled', 'operational', 'running'].includes(status)) {
    return { label: 'Active', variant: 'default' };
  }

  // Inactive states
  if (['inactive', 'disabled', 'temporarily_inactive', 'suspended', 'maintenance'].includes(status)) {
    return { label: 'Inactive', variant: 'secondary' };
  }

  // Unknown status - default to Active with tooltip
  return {
    label: 'Active',
    variant: 'default',
    tooltip: `Unknown status: ${rawStatus}`
  };
}
