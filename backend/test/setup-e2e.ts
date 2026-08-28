/**
 * Environment the end-to-end suites boot against.
 *
 * The application deliberately refuses to start without a real JWT secret
 * (see auth.module.ts), so the suite has to provide one. No database URL is
 * needed: every suite replaces PrismaService with a double.
 *
 * `??=` so a value already present in the environment wins — running the
 * suites against a real configuration stays possible.
 */
process.env.JWT_SECRET ??= 'e2e-test-secret-long-enough-to-satisfy-the-check';
process.env.NODE_ENV ??= 'test';
