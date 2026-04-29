import { Router, Request, Response } from 'express';
import { AccountModel } from '../../models/account.model';
import { EmailQueueModel } from '../../models/email-queue.model';
import { EmailLogModel } from '../../models/email-log.model';
import { LoadBalancerService } from '../../services/load-balancer.service';
import { StatsOverview, AccountStats } from '../../types';

const router = Router();

// GET /api/stats - Overall statistics
router.get('/', (req: Request, res: Response) => {
  try {
    const accountCounts = AccountModel.count();
    const todayStats = EmailLogModel.getTodayStats();
    const queueCounts = EmailQueueModel.getStatusCounts();
    const capacity = LoadBalancerService.getTotalCapacity();

    const totalSent = todayStats.sent;
    const totalFailed = todayStats.failed;
    const successRate = totalSent + totalFailed > 0
      ? Math.round((totalSent / (totalSent + totalFailed)) * 100)
      : 100;

    const stats: StatsOverview = {
      total_accounts: accountCounts.total,
      active_accounts: accountCounts.active,
      total_sent_today: totalSent,
      total_failed_today: totalFailed,
      total_remaining_today: capacity.remaining,
      queue_pending: queueCounts.pending || 0,
      queue_processing: queueCounts.processing || 0,
      success_rate: successRate,
    };

    res.json({ success: true, data: stats });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/stats/accounts - Per-account statistics
router.get('/accounts', (req: Request, res: Response) => {
  try {
    const accounts = AccountModel.getAllWithUsage();

    const stats: AccountStats[] = accounts.map(a => ({
      account_id: a.id,
      email: a.email,
      display_name: a.display_name,
      daily_limit: a.daily_limit,
      sent_today: a.today_sent,
      failed_today: a.today_failed,
      remaining_today: Math.max(0, a.daily_limit - a.today_sent),
      is_active: a.is_active === 1,
    }));

    res.json({ success: true, data: stats });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/stats/daily - Daily send trends
router.get('/daily', (req: Request, res: Response) => {
  try {
    const days = req.query.days ? parseInt(req.query.days as string) : 30;
    const stats = EmailLogModel.getDailyStats(days);
    res.json({ success: true, data: stats });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
