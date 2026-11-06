import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  signupEmail, verifyEmail, login, logout, startPhoneVerification, verifyPhone, totpSetup, totpConfirm, telegramLogin,
  publicUser, passkeyRegistrationOptions, passkeyRegister, passkeyAuthOptions, passkeyLogin, changePassword, randomToken, type User,
} from '@p2p/core';
import { SignupEmailSchema, LoginSchema, VerifyEmailSchema, PhoneStartSchema, PhoneVerifySchema, TelegramAuthSchema, TotpConfirmSchema } from '@p2p/shared';
import { z } from 'zod';
import { CTX, type Ctx } from '../common/ctx';
import { CurrentUser, Meta, Public, SESSION_COOKIE, CSRF_COOKIE, tokenFrom } from '../common/auth.guard';
import { NoIdempotency } from '../common/idempotency.interceptor';
import { RateLimit } from '../common/rate-limit.guard';
import { Zod } from '../common/zod';

const secure = () => process.env.NODE_ENV === 'production';
export function setSessionCookies(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, { httpOnly: true, secure: secure(), sameSite: 'strict', path: '/', maxAge: 7 * 24 * 3600_000 });
  const csrf = randomToken(16);
  res.cookie(CSRF_COOKIE, csrf, { httpOnly: false, secure: secure(), sameSite: 'strict', path: '/' });
  return csrf;
}

@Controller('v1/auth')
export class AuthController {
  constructor(@Inject(CTX) private ctx: Ctx) {}

  @Public() @Post('signup') @RateLimit(10)
  async signup(@Body(new Zod(SignupEmailSchema, 'SignupEmail')) b: z.infer<typeof SignupEmailSchema>, @Meta() meta: any) {
    const { user, emailToken } = await signupEmail(this.ctx, b, meta);
    return { user: publicUser(user), devEmailToken: this.ctx.providers.mode === 'mock' ? emailToken : undefined };
  }

  @Public() @Post('verify-email') @HttpCode(200)
  async verifyEmail(@Body(new Zod(VerifyEmailSchema, 'VerifyEmail')) b: z.infer<typeof VerifyEmailSchema>) {
    return { user: publicUser(await verifyEmail(this.ctx, b.token)) };
  }

  @Public() @NoIdempotency() @Post('login') @HttpCode(200) @RateLimit(20)
  async login(@Body(new Zod(LoginSchema, 'Login')) b: z.infer<typeof LoginSchema>, @Meta() meta: any, @Res({ passthrough: true }) res: Response) {
    const s = await login(this.ctx, b, { ...meta, fingerprint: b.deviceFingerprint ?? meta.fingerprint });
    const csrf = setSessionCookies(res, s.token);
    return { user: s.user, token: s.token, csrf };
  }

  @Public() @NoIdempotency() @Post('telegram') @HttpCode(200) @RateLimit(20)
  async telegram(@Body(new Zod(TelegramAuthSchema, 'TelegramAuth')) b: z.infer<typeof TelegramAuthSchema>, @Meta() meta: any, @Res({ passthrough: true }) res: Response) {
    const s = await telegramLogin(this.ctx, b.initData, b.country, meta);
    const csrf = setSessionCookies(res, s.token);
    return { user: s.user, token: s.token, csrf };
  }

  @NoIdempotency() @Post('logout') @HttpCode(200)
  async logout(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    const { token } = tokenFrom(req);
    if (token) await logout(this.ctx, token);
    res.clearCookie(SESSION_COOKIE); res.clearCookie(CSRF_COOKIE);
    return { ok: true };
  }

  @Post('phone/start') @RateLimit(5)
  phoneStart(@CurrentUser() u: User, @Body(new Zod(PhoneStartSchema, 'PhoneStart')) b: z.infer<typeof PhoneStartSchema>) {
    return startPhoneVerification(this.ctx, u.id, b.phone);
  }
  @Post('phone/verify') @HttpCode(200)
  async phoneVerify(@CurrentUser() u: User, @Body(new Zod(PhoneVerifySchema, 'PhoneVerify')) b: z.infer<typeof PhoneVerifySchema>) {
    return { user: publicUser(await verifyPhone(this.ctx, u.id, b.phone, b.code)) };
  }

  @Post('2fa/setup')
  totpSetup(@CurrentUser() u: User) { return totpSetup(this.ctx, u.id); }
  @Post('2fa/confirm') @HttpCode(200)
  totpConfirm(@CurrentUser() u: User, @Body(new Zod(TotpConfirmSchema, 'TotpConfirm')) b: z.infer<typeof TotpConfirmSchema>, @Meta() meta: any) {
    return totpConfirm(this.ctx, u.id, b.code, meta);
  }

  @Post('password') @HttpCode(200)
  async password(@CurrentUser() u: User, @Body(new Zod(z.object({ oldPassword: z.string(), newPassword: z.string().min(10).max(256), totp: z.string().optional() }), 'ChangePassword')) b: any, @Meta() meta: any) {
    await changePassword(this.ctx, u, b.oldPassword, b.newPassword, b.totp, meta);
    return { ok: true };
  }

  @Post('passkeys/register/options')
  passkeyRegOptions(@CurrentUser() u: User): Promise<unknown> { return passkeyRegistrationOptions(this.ctx, { kind: 'user', id: u.id, name: u.email ?? u.id }); }
  @Post('passkeys/register') @HttpCode(200)
  passkeyRegister(@CurrentUser() u: User, @Body() b: any) { return passkeyRegister(this.ctx, { kind: 'user', id: u.id }, b); }

  @Public() @NoIdempotency() @Post('passkeys/login/options') @HttpCode(200)
  passkeyLoginOptions(@Body(new Zod(z.object({ sessionKey: z.string().min(8).max(64) }))) b: { sessionKey: string }): Promise<unknown> { return passkeyAuthOptions(this.ctx, b.sessionKey); }
  @Public() @NoIdempotency() @Post('passkeys/login') @HttpCode(200)
  async passkeyLogin(@Body() b: { sessionKey: string; response: any }, @Meta() meta: any, @Res({ passthrough: true }) res: Response) {
    const s = await passkeyLogin(this.ctx, b.sessionKey, b.response, meta);
    const csrf = setSessionCookies(res, s.token);
    return { user: s.user, token: s.token, csrf };
  }

  @Get('me')
  me(@CurrentUser() u: User) { return { user: publicUser(u) }; }
}
