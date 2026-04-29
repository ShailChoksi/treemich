/**
 * @file try/catch wrappers for localStorage so quota, privacy, or policy failures never crash the app.
 */

/**
 * @returns the stored value, or `null` if missing or on any storage error
 */
export const getLocalStorageItem = (key: string): string | null => {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

/**
 * @returns true if the value was written successfully
 */
export const setLocalStorageItem = (key: string, value: string): boolean => {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};
