import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { TenantsModule } from "../tenants/tenants.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { CsrfGuard } from "./guards/csrf.guard";
import { RolesGuard } from "./guards/roles.guard";
import { SessionGuard } from "./guards/session.guard";
import { TenantGuard } from "./guards/tenant.guard";
import { PasswordService } from "./password.service";
import { SessionsRepository } from "./sessions.repository";

/** Global guards run in registration order: session → CSRF → tenant → role. */
@Module({
  imports: [TenantsModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    SessionsRepository,
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [PasswordService],
})
export class AuthModule {}
