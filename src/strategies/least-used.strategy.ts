import { LoadBalancerStrategy, AccountWithUsage, Account } from '../types';

export class LeastUsedStrategy implements LoadBalancerStrategy {
  name: 'least-used' = 'least-used';

  selectAccount(accounts: AccountWithUsage[]): Account | null {
    if (accounts.length === 0) return null;

    // Sort by today_sent ascending (least used first), then by remaining descending
    const sorted = [...accounts].sort((a, b) => {
      if (a.today_sent !== b.today_sent) {
        return a.today_sent - b.today_sent;
      }
      return b.remaining - a.remaining;
    });

    return sorted[0];
  }
}
