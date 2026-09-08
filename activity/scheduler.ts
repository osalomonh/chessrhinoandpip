// An injectable timer, so tests never actually wait.

export type Cancel = () => void;

export type Scheduler = (ms: number, cb: () => void) => Cancel;

export const defaultScheduler: Scheduler = (ms, cb) => {
  const id = setTimeout(cb, ms);
  return () => clearTimeout(id);
};
