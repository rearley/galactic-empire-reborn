import { Module } from '@nestjs/common';
import { CybertronControlService } from './cybertron-control.service';
import { CybTraceService } from './cyb-trace.service';

/**
 * The sysop's handles on the Cybertrons: the pause switch (`sys cybpause`) and
 * the decision trace (`sys trace`).
 *
 * Deliberately separate from CybertronModule so CommandsModule can import it
 * without importing the AI itself. `sys cybpause` needs to SET the flag and the
 * Cybertron tick needs to READ it; giving them a shared leaf module keeps that
 * a one-way dependency for both, where importing CybertronModule from the
 * command side would close a cycle. The trace is written by the tick, by `pha`
 * and by combat's kill sweep, and read by `sys`; this is the one module all
 * four can import.
 */
@Module({
  providers: [CybertronControlService, CybTraceService],
  exports: [CybertronControlService, CybTraceService],
})
export class CybertronControlModule {}
