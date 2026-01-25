/**
 * Type definitions for the Volve Explorer Production Dashboard
 *
 * These interfaces are used throughout the application for type safety
 * and are aligned with the remote schema at volve-db.ocortez.com
 */

// =============================================================================
// Schema Types - For dynamic schema loading from schema.json
// =============================================================================

/**
 * Root schema definition containing all tables
 */
export interface SchemaDefinition {
  tables: TableSchema[];
}

/**
 * Schema for a single database table
 */
export interface TableSchema {
  name: string;
  columns: ColumnSchema[];
  primaryKey: string[];
  foreignKeys?: ForeignKey[];
}

/**
 * Schema for a single column within a table
 */
export interface ColumnSchema {
  name: string;
  type: ColumnType;
  nullable: boolean;
  description?: string;
}

/**
 * Supported column data types
 */
export type ColumnType = "INTEGER" | "FLOAT" | "TEXT" | "DATE" | "BOOLEAN";

/**
 * Foreign key relationship definition
 */
export interface ForeignKey {
  columns: string[];
  references: {
    table: string;
    columns: string[];
  };
}

// =============================================================================
// Well Types
// =============================================================================

/**
 * Well metadata from the wells table
 */
export interface Well {
  /** NPD wellbore code - unique identifier */
  id: number;
  /** Wellbore name for display */
  name: string;
  /** Optional field name */
  field?: string;
  /** Optional facility name */
  facility?: string;
}

// =============================================================================
// Production Data Types
// =============================================================================

/**
 * Daily production record aggregated by date
 * Used for the time series line chart
 */
export interface DailyProductionRecord {
  /** Production date */
  date: Date;
  /** Oil production volume in sm3 */
  oil: number;
  /** Water production volume in sm3 */
  water: number;
  /** Optional gas production volume in sm3 */
  gas?: number;
}

/**
 * Cumulative production for a single well
 * Used for the top wells bar chart
 */
export interface WellCumulativeRecord {
  /** NPD wellbore code */
  wellId: number;
  /** Well display name */
  wellName: string;
  /** Cumulative oil production in sm3 */
  cumulativeOil: number;
}

/**
 * Field-level cumulative production totals
 * Used for the pie chart
 */
export interface FieldCumulativeTotals {
  /** Total oil production in sm3 */
  oil: number;
  /** Total water production in sm3 */
  water: number;
  /** Total gas production in sm3 */
  gas: number;
}

// =============================================================================
// Filter Types
// =============================================================================

/**
 * Date range for filtering production data
 */
export interface DateRange {
  /** Start date (inclusive) */
  start: Date;
  /** End date (inclusive) */
  end: Date;
}

// =============================================================================
// UI State Types
// =============================================================================

/**
 * Dashboard state for filters and UI
 */
export interface DashboardState {
  /** Currently selected well IDs (empty = all wells) */
  selectedWellIds: number[];
  /** Selected date range (null = full range) */
  dateRange: DateRange | null;
  /** Whether data is currently loading */
  isLoading: boolean;
  /** Error message if any */
  error: string | null;
}

/**
 * Data state for fetched query results
 */
export interface DataState {
  /** List of all available wells */
  wells: Well[];
  /** Daily production time series data */
  dailyProduction: DailyProductionRecord[];
  /** Cumulative production by well */
  wellCumulatives: WellCumulativeRecord[];
  /** Field-level totals */
  fieldTotals: FieldCumulativeTotals | null;
}

// =============================================================================
// Chart Configuration Types
// =============================================================================

/**
 * Configuration for the daily production line chart
 */
export interface LineChartConfig {
  height: number;
  colors: {
    oil: string;
    water: string;
  };
  showBrush: boolean;
}

/**
 * Configuration for the cumulative pie chart
 */
export interface PieChartConfig {
  height: number;
  colors: {
    oil: string;
    water: string;
  };
  arcWidth: number;
}

/**
 * Configuration for the top wells bar chart
 */
export interface BarChartConfig {
  height: number;
  color: string;
  maxWells: number;
  orientation: "horizontal" | "vertical";
}

// =============================================================================
// API Response Types
// =============================================================================

/**
 * Raw schema.json response structure
 * This matches the actual structure returned by the API
 */
export interface RawSchemaResponse {
  tables: Array<{
    name: string;
    columns: Array<{
      name: string;
      type: string;
      nullable?: boolean;
      description?: string;
    }>;
    primaryKey?: string[];
    foreignKeys?: Array<{
      columns: string[];
      references: {
        table: string;
        columns: string[];
      };
    }>;
  }>;
}
