import { Module } from '@nestjs/common';
import { CybertronControlService } from './cybertron-control.service';

/**
 * A module holding only the Cybertron pause switch.
 *
 * Deliberately separate from CybertronModule so CommandsModule can import it
 * without importing the AI itself. `sys cybpause` needs to SET the flag and the
 * Cybertron tick needs to READ it; giving them a shared leaf module keeps that
 * a one-way dependency for both, where importing CybertronModule from the
 * command side would close a cycle.
 */
@Module({
  providers: [CybertronControlService],
  exports: [CybertronControlService],
})
export class CybertronControlModule {}
