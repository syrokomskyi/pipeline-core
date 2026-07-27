/*
<MODULE_CONTRACT>
<purpose>Emits structured NDJSON logs to stdout or stderr for application monitoring.</purpose>
<non-goals>
  <item>Does not provide log transport abstraction or dependencies.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of NDJSON logger with context binding.</item>
</CHANGE_SUMMARY>
*/

/**
 * Minimal NDJSON logger.
 *
 * Emits one JSON object per line to stdout (info/warn/debug) or stderr (error).
 * Shape:
 *   { ts, level, app, pipeline?, gogol?, batchId?, msg, ...ctx }
 *
 * No dependencies, no transport abstraction — a single line per call keeps
 * the output append-only and pipeable into `jq`, Loki, Datadog, etc.
 *
 * Usage:
 *   const log = createJsonLogger({ app: 'hdri-publication', pipeline: 'publish' });
 *   log.info('load-publication-data', 'loaded cohort', { siteCount: 321 });
 *
 *   // Or with a bound context per gogol:
 *   const glog = log.withContext({ gogol: 'load-publication-data', batchId });
 *   glog.info('loaded cohort', { siteCount: 321 });
 *   glog.warn('missing core.db — skipping site metadata');
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  app?: string;
  pipeline?: string;
  gogol?: string;
  batchId?: string;
  [k: string]: unknown;
}

export interface JsonLogger {
  debug(
    msgOrGogol: string,
    msgOrCtx?: string | Record<string, unknown>,
    ctx?: Record<string, unknown>,
  ): void;
  info(
    msgOrGogol: string,
    msgOrCtx?: string | Record<string, unknown>,
    ctx?: Record<string, unknown>,
  ): void;
  warn(
    msgOrGogol: string,
    msgOrCtx?: string | Record<string, unknown>,
    ctx?: Record<string, unknown>,
  ): void;
  error(
    msgOrGogol: string,
    msgOrCtx?: string | Record<string, unknown>,
    ctx?: Record<string, unknown>,
  ): void;
  withContext(extra: LogContext): JsonLogger;
}

/** Where NDJSON records are written. Override for tests. */
export interface LogSink {
  out(line: string): void;
  err(line: string): void;
}

const defaultSink: LogSink = {
  out: (line) => process.stdout.write(line + "\n"),
  err: (line) => process.stderr.write(line + "\n"),
};

/**
 * createJsonLogger — returns a logger bound to the given base context.
 *
 * Each call accepts:
 *   - logger.info(msg)
 *   - logger.info(msg, ctx)
 *   - logger.info(gogolId, msg)               // 2-arg form: first arg is gogolId
 *   - logger.info(gogolId, msg, ctx)          // 3-arg form
 */
export function createJsonLogger(base: LogContext, sink: LogSink = defaultSink): JsonLogger {
  function emit(
    level: LogLevel,
    a: string,
    b?: string | Record<string, unknown>,
    c?: Record<string, unknown>,
  ): void {
    let gogol: string | undefined;
    let msg: string;
    let ctx: Record<string, unknown> | undefined;
    if (typeof b === "string") {
      gogol = a;
      msg = b;
      ctx = c;
    } else {
      msg = a;
      ctx = b;
    }
    const record: Record<string, unknown> = {
      ts: new Date().toISOString(),
      level,
      ...base,
      ...(gogol ? { gogol } : null),
      msg,
      ...(ctx ?? null),
    };
    const line = safeStringify(record);
    if (level === "error") sink.err(line);
    else sink.out(line);
  }

  return {
    debug: (a, b, c) => emit("debug", a, b, c),
    info: (a, b, c) => emit("info", a, b, c),
    warn: (a, b, c) => emit("warn", a, b, c),
    error: (a, b, c) => emit("error", a, b, c),
    withContext(extra) {
      return createJsonLogger({ ...base, ...extra }, sink);
    },
  };
}

/**
 * JSON.stringify with a best-effort fallback for cycles / bigints / errors.
 * Never throws — a logger that throws is worse than a logger that drops fields.
 */
function safeStringify(obj: unknown): string {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(obj, (_key, value) => {
      if (typeof value === "bigint") return value.toString();
      if (value instanceof Error) {
        return { name: value.name, message: value.message, stack: value.stack };
      }
      if (value && typeof value === "object") {
        if (seen.has(value as object)) return "[Circular]";
        seen.add(value as object);
      }
      return value;
    });
  } catch (err) {
    return JSON.stringify({
      ts: new Date().toISOString(),
      level: "error",
      msg: "logger serialisation failed",
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
