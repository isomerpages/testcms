export enum JobStatus {
  Ready = "READY", // Ready to run jobs
  Running = "RUNNING", // A job is running
  Failed = "FAILED", // A job has failed and recovery is needed
}

export enum SiteStatus {
  Empty = "EMPTY", // A site record site is being initialized
  Initialized = "INITIALIZED",
  Launched = "LAUNCHED",
}

export enum RedirectionTypes {
  CNAME = "CNAME",
  A = "A",
}
