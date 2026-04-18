type Level = "info" | "warn" | "error" | "debug";

function ts(): string {
    return new Date().toISOString();
}

function write(level: Level, scope: string, message: string, extra?: unknown): void {
    const line = `[${ts()}] [${level.toUpperCase()}] [${scope}] ${message}`;
    if (extra !== undefined) {
        console.log(line, extra);
    } else {
        console.log(line);
    }
}

export const logger = {
    info: (scope: string, msg: string, extra?: unknown) => write("info", scope, msg, extra),
    warn: (scope: string, msg: string, extra?: unknown) => write("warn", scope, msg, extra),
    error: (scope: string, msg: string, extra?: unknown) => write("error", scope, msg, extra),
    debug: (scope: string, msg: string, extra?: unknown) => {
        if (process.env.NODE_ENV !== "production") write("debug", scope, msg, extra);
    },
};
