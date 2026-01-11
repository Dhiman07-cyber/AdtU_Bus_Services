/**
 * Bus Fee Management Service
 * Handles bus fee storage in system_config.json
 */

import fs from 'fs';
import path from 'path';

export interface BusFeeData {
  amount: number;
  updatedAt: string;
  updatedBy: string;
  version: number; // For conflict resolution (kept for interface compatibility)
}

export interface BusFeeHistory {
  amount: number;
  updatedAt: string;
  updatedBy: string;
  version: number;
}

// Interface matching src/config/system_config.json
interface SystemConfig {
  appName: string;
  busFee: {
    amount: number;
    history?: BusFeeHistory[];
  };
  paymentExport?: {
    startYear: number;
    interval: number;
  };
  academicYearEnd?: string;
  renewalReminder?: string;
  renewalDeadline?: string;
  softBlock?: string;
  hardBlock?: string;
  version: string;
  lastUpdated: string;
  updatedBy: string;
  [key: string]: any; // Allow other properties
}

const CONFIG_FILE_PATH = path.join(process.cwd(), 'src', 'config', 'system_config.json');

/**
 * Read system config from JSON file
 */
function readSystemConfig(): SystemConfig {
  try {
    const fileContent = fs.readFileSync(CONFIG_FILE_PATH, 'utf-8');
    return JSON.parse(fileContent);
  } catch (error) {
    console.error('Error reading system config:', error);
    // Return a default fallback if file doesn't exist or is corrupted
    return {
      appName: "AdtU Bus Services",
      busFee: {
        amount: 0
      },
      version: "v1.0.0",
      lastUpdated: new Date().toISOString(),
      updatedBy: 'system'
    };
  }
}

/**
 * Write system config to JSON file
 */
function writeSystemConfig(config: SystemConfig): void {
  try {
    fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(config, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error writing system config:', error);
    throw error;
  }
}

/**
 * Get current bus fee from system config file
 */
export async function getCurrentBusFee(): Promise<BusFeeData> {
  try {
    const config = readSystemConfig();

    console.log('🔍 Fetching bus fee from system_config.json...');
    const amount = config.busFee?.amount || 0;

    console.log('📊 Bus fee data from config:', {
      amount: amount,
      updatedAt: config.lastUpdated,
      updatedBy: config.updatedBy,
      version: config.version
    });

    return {
      amount: amount,
      updatedAt: config.lastUpdated || new Date().toISOString(),
      updatedBy: config.updatedBy || 'system',
      version: 1 // Returning 1 as a placeholder since system config uses string version
    };
  } catch (error) {
    console.error('Error getting current bus fee:', error);
    // Return default on error
    return {
      amount: 0,
      updatedAt: new Date().toISOString(),
      updatedBy: 'system',
      version: 1
    };
  }
}

/**
 * Update bus fee in system config file
 * This updates the global bus fee for the system
 */
export async function updateBusFee(
  adminUid: string,
  newAmount: number
): Promise<{ success: boolean; error?: string; previousAmount?: number }> {
  try {
    // Get current config
    const currentConfig = readSystemConfig();

    // Ensure busFee object exists
    if (!currentConfig.busFee) {
      currentConfig.busFee = { amount: 0 };
    }

    const previousAmount = currentConfig.busFee.amount;

    // Add current state to history before updating (if we decide to support history in system config)
    if (!currentConfig.busFee.history) {
      currentConfig.busFee.history = [];
    }

    currentConfig.busFee.history.push({
      amount: previousAmount,
      updatedAt: currentConfig.lastUpdated || new Date().toISOString(),
      updatedBy: currentConfig.updatedBy || 'system',
      version: 1 // Placeholder
    });

    // Update with new values
    currentConfig.busFee.amount = newAmount;
    currentConfig.lastUpdated = new Date().toISOString();
    currentConfig.updatedBy = adminUid;
    // We strictly shouldn't just bump version string blindly, but for now we keep it simple or leave it. 
    // Let's not touch the version string to avoid format issues, or maybe just update timestamp.

    // Write to file
    writeSystemConfig(currentConfig);

    console.log(`✅ Bus fee updated by admin ${adminUid}: ${previousAmount} → ${newAmount}`);
    console.log(`📝 Config saved to: ${CONFIG_FILE_PATH}`);

    return {
      success: true,
      previousAmount
    };
  } catch (error: any) {
    console.error('Error updating bus fee:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get bus fee update history
 */
export async function getBusFeeHistory(): Promise<BusFeeHistory[]> {
  try {
    const config = readSystemConfig();
    return config.busFee?.history || [];
  } catch (error) {
    console.error('Error getting bus fee history:', error);
    return [];
  }
}

/**
 * Initialize bus fee config file if not exists
 * Creates the config file with default value if system config is missing
 */
export async function initializeBusFee(defaultAmount: number = 0): Promise<void> {
  try {
    // Check if file exists
    if (!fs.existsSync(CONFIG_FILE_PATH)) {
      const defaultConfig: SystemConfig = {
        appName: "AdtU Bus Services",
        busFee: {
          amount: defaultAmount,
          history: []
        },
        version: "v1.0.0",
        lastUpdated: new Date().toISOString(),
        updatedBy: 'system'
      };

      // Create directory if it doesn't exist
      const configDir = path.dirname(CONFIG_FILE_PATH);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      writeSystemConfig(defaultConfig);
      console.log(`✅ Initialized system config file with bus fee: ${defaultAmount}`);
    }
  } catch (error) {
    console.error('Error initializing bus fee:', error);
  }
}
