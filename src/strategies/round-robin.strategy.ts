import { LoadBalancerStrategy, AccountWithUsage, Account } from '../types';

export class RoundRobinStrategy implements LoadBalancerStrategy {
  name: 'round-robin' = 'round-robin';
  private lastIndex: number = -1;

  selectAccount(accounts: AccountWithUsage[]): Account | null {
    if (accounts.length === 0) return null;

    // Move to next index, wrap around
    this.lastIndex = (this.lastIndex + 1) % accounts.length;
    return accounts[this.lastIndex];
  }
}
