import { LoadBalancerStrategy, AccountWithUsage, Account } from '../types';

export class RandomStrategy implements LoadBalancerStrategy {
  name: 'random' = 'random';

  selectAccount(accounts: AccountWithUsage[]): Account | null {
    if (accounts.length === 0) return null;

    const index = Math.floor(Math.random() * accounts.length);
    return accounts[index];
  }
}
