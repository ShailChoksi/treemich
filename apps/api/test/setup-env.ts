import process from "node:process";

process.env.NODE_ENV ??= "test";
process.env.PORT ??= "4000";
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/treemich_test";
process.env.IMMICH_BASE_URL ??= "http://localhost:2283";
process.env.IMMICH_PEOPLE_PAGE_SIZE ??= "1000";
process.env.TREEMICH_ENCRYPTION_KEY ??= "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.TREEMICH_SESSION_COOKIE_NAME ??= "treemich_session";
process.env.TREEMICH_SESSION_TTL_MS ??= "2592000000";
process.env.RATE_LIMIT_MAX ??= "300";
process.env.RATE_LIMIT_TIME_WINDOW_MS ??= "60000";
process.env.TREEMICH_COOKIE_SECURE ??= "false";
