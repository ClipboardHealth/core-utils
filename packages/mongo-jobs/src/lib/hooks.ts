export interface BeforeEnqueueEvent {
  handlerName: string;
  data: Readonly<Record<string, unknown>>;
  setContext: (key: string, value: unknown) => void;
}

export interface BeforePerformEvent {
  handlerName: string;
  data: Readonly<Record<string, unknown> & { _context: Record<string, unknown> }>;
}
