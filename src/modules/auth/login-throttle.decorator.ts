import { SetMetadata } from '@nestjs/common';

export const LOGIN_THROTTLE_KEY = 'loginThrottle';
export const LOGIN_THROTTLER_NAME = 'login';

/** Opts a route into the strict `login` throttler (limits come from env, see AppModule). */
export const LoginThrottle = (): MethodDecorator => SetMetadata(LOGIN_THROTTLE_KEY, true);
