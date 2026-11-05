import { AuthController } from './auth.controller';
import { SystemController } from './system.controller';
import { TradingController } from './trading.controller';
import { DevController } from './dev.controller';
export const CONTROLLERS = [AuthController, SystemController, TradingController, ...(process.env.NODE_ENV === 'production' ? [] : [DevController])];
