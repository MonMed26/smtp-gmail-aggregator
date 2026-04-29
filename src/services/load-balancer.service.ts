import { AccountModel } from '../models/account.model';
import { getStrategy } from '../strategies';
import { Account, StrategyType, AccountWithUsage } from '../types';
import { config } from '../config';
import { logger } from '../utils/logger';

export class LoadBalancerService {
  static selectAccount(strategy?: StrategyType): Account | null {
    const strategyType = strategy || config.defaultStrategy;
    const accounts = AccountModel.getActiveWithUsage();

    if (accounts.length === 0) {
      logger.warn('No available accounts with remaining quota');
      return null;
    }

    const strategyInstance = getStrategy(strategyType);
    const selected = strategyInstance.selectAccount(accounts);

    if (selected) {
      logger.debug(`Load balancer (${strategyType}) selected: ${selected.email}`);
    }

    return selected;
  }

  static getAvailableAccounts(): AccountWithUsage[] {
    return AccountModel.getActiveWithUsage();
  }

  static getTotalCapacity(): { used: number; total: number; remaining: number } {
    const accounts = AccountModel.getAllWithUsage();
    const activeAccounts = accounts.filter(a => a.is_active === 1);

    const total = activeAccounts.reduce((sum, a) => sum + a.daily_limit, 0);
    const used = activeAccounts.reduce((sum, a) => sum + a.today_sent, 0);

    return {
      used,
      total,
      remaining: total - used,
    };
  }
}
