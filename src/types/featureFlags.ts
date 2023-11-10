// Use for type safety with GrowthBook
// Add BE feature flags here to mirror that on GrowthBook
// Note: key should mirror GrowthBook exactly as it is

export interface cmConfigType {
  is_enabled: boolean
  timeout: number
}

export interface FeatureFlags {
  is_build_times_reduction_enabled: boolean
  is_ggs_enabled: boolean
  is_show_staging_build_status_enabled: boolean
  is_cloudmersive_enabled: cmConfigType
}

// List of attributes we set in GrowthBook Instance in auth middleware
export type GrowthBookAttributes = {
  isomerUserId: string
  email: string
  githubId?: string
  siteName?: string
}
