import { AuthController } from './auth.controller';
import { SystemController } from './system.controller';
import { TradingController } from './trading.controller';
import { DevController } from './dev.controller';
import { KycController } from './kyc.controller';
import { SocialController } from './social.controller';
import { WalletController } from './wallet.controller';
import { DisputesController } from './disputes.controller';
export const CONTROLLERS = [AuthController, SystemController, TradingController, KycController, SocialController, WalletController, DisputesController, ...(process.env.NODE_ENV === 'production' ? [] : [DevController])];
