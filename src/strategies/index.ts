import { LoadBalancerStrategy, StrategyType } from '../types';
import { RoundRobinStrategy } from './round-robin.strategy';
import { LeastUsedStrategy } from './least-used.strategy';
import { RandomStrategy } from './random.strategy';

const strategies: Record<StrategyType, LoadBalancerStrategy> = {
  'round-robin': new RoundRobinStrategy(),
  'least-used': new LeastUsedStrategy(),
  'random': new RandomStrategy(),
};

export function getStrategy(type: StrategyType): LoadBalancerStrategy {
  const strategy = strategies[type];
  if (!strategy) {
    throw new Error(`Unknown strategy: ${type}`);
  }
  return strategy;
}

export { RoundRobinStrategy } from './round-robin.strategy';
export { LeastUsedStrategy } from './least-used.strategy';
export { RandomStrategy } from './random.strategy';
