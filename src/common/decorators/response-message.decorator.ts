import { SetMetadata } from '@nestjs/common';

export const RESPONSE_MESSAGE_KEY = 'responseMessage';
export const DEFAULT_SUCCESS_MESSAGE = 'Thành công';

/** Sets the Vietnamese `message` of the success envelope for a handler. */
export const ResponseMessage = (message: string): MethodDecorator =>
  SetMetadata(RESPONSE_MESSAGE_KEY, message);
