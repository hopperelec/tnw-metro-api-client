export { MetroApiClient, MetroApiError } from './client';
export * from './types';

/**
 * Calculates the difference, in seconds, between two times in the timetable.
 * @param a - first time in seconds since midnight
 * @param b - second time in seconds since midnight
 * @param newDayHour - the hour (0-23) that marks the start of a new timetabled day
 */
export function compareTimes(a: number, b: number, newDayHour: number) {
    const newDaySeconds = newDayHour * 3600;
    function normaliseTime(time: number) {
        // JavaScript allows % to return negative values, so we need to coerce it to a positive value
        return ((time - newDaySeconds) % 86400 + 86400) % 86400;
    }
    return normaliseTime(a) - normaliseTime(b);
}
