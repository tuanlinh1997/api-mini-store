import { Global, Module } from '@nestjs/common';

import { DocumentNumbersService } from './document-numbers.service';

@Global()
@Module({
  providers: [DocumentNumbersService],
  exports: [DocumentNumbersService],
})
export class SequencesModule {}
