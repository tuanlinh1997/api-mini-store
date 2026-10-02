import { Logger } from '@nestjs/common';

// Keep unit-test output readable: services log warnings on purpose (failed logins, denials).
Logger.overrideLogger(false);
