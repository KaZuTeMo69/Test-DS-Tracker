import { formatDate } from "./contract";

/**
 * This build of the app, as Settings shows it. The version is package.json's: raised with each release merged
 * (1.1.0 for new features, 1.0.1 for fixes). The commit and the day are filled in when the app is built.
 */
export const APP_VERSION = __APP_VERSION__;
export const APP_COMMIT = __APP_COMMIT__;

/** The build's day as the app writes dates ("03 Oct 2026"); as given if it isn't a date. */
export function builtOn(day: string = __APP_BUILT__): string {
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? day : formatDate(date);
}

/** "Version 1.0.0 · build 9e281f0", for a bug report */
export const versionLine = () => `Version ${APP_VERSION} · build ${APP_COMMIT}`;
