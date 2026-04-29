import { Router, Request, Response } from 'express';
import { AccountModel } from '../models/account.model';
import { EmailQueueModel } from '../models/email-queue.model';
import { EmailLogModel } from '../models/email-log.model';
import { LoadBalancerService } from '../services/load-balancer.service';
import { smtpPool } from '../services/smtp-pool.service';
import { config } from '../config';
import { loginRateLimiter } from '../middleware/rate-limit.middleware';
import { dashboardAuth } from '../middleware/auth.middleware';

const router = Router();

// Login page
router.get('/login', (req: Request, res: Response) => {
  if (req.session && req.session.authenticated) {
    res.redirect('/');
    return;
  }
  res.render('login', { title: 'Login', error: null, currentPage: 'login' });
});

// Login POST
router.post('/login', loginRateLimiter, (req: Request, res: Response) => {
  const { username, password } = req.body;

  if (username === config.dashboard.user && password === config.dashboard.pass) {
    req.session.authenticated = true;
    res.redirect('/');
  } else {
    res.render('login', { title: 'Login', error: 'Invalid credentials', currentPage: 'login' });
  }
});

// Logout
router.get('/logout', (req: Request, res: Response) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// Apply dashboard auth to all routes below
router.use(dashboardAuth);

// Dashboard overview
router.get('/', (req: Request, res: Response) => {
  try {
    const accountCounts = AccountModel.count();
    const todayStats = EmailLogModel.getTodayStats();
    const queueCounts = EmailQueueModel.getStatusCounts();
    const capacity = LoadBalancerService.getTotalCapacity();
    const dailyStats = EmailLogModel.getDailyStats(7);

    const successRate = todayStats.sent + todayStats.failed > 0
      ? Math.round((todayStats.sent / (todayStats.sent + todayStats.failed)) * 100)
      : 100;

    res.render('dashboard', {
      title: 'Dashboard',
      currentPage: 'dashboard',
      stats: {
        totalAccounts: accountCounts.total,
        activeAccounts: accountCounts.active,
        sentToday: todayStats.sent,
        failedToday: todayStats.failed,
        remaining: capacity.remaining,
        totalCapacity: capacity.total,
        queuePending: queueCounts.pending || 0,
        queueProcessing: queueCounts.processing || 0,
        successRate,
      },
      dailyStats,
    });
  } catch (error: any) {
    res.render('error', { title: 'Error', message: error.message, error: error.message, currentPage: '' });
  }
});

// Accounts page
router.get('/accounts', (req: Request, res: Response) => {
  try {
    const accounts = AccountModel.getAllWithUsage();
    res.render('accounts', { title: 'Accounts', currentPage: 'accounts', accounts });
  } catch (error: any) {
    res.render('error', { title: 'Error', message: error.message, error: error.message, currentPage: '' });
  }
});

// Add account POST (from dashboard form)
router.post('/accounts', async (req: Request, res: Response) => {
  try {
    const { email, app_password, display_name, daily_limit } = req.body;

    if (!email || !app_password) {
      const accounts = AccountModel.getAllWithUsage();
      res.render('accounts', {
        title: 'Accounts',
        currentPage: 'accounts',
        accounts,
        error: 'Email and App Password are required',
      });
      return;
    }

    const existing = AccountModel.findByEmail(email);
    if (existing) {
      const accounts = AccountModel.getAllWithUsage();
      res.render('accounts', {
        title: 'Accounts',
        currentPage: 'accounts',
        accounts,
        error: 'Account with this email already exists',
      });
      return;
    }

    AccountModel.create({
      email,
      app_password,
      display_name: display_name || undefined,
      daily_limit: daily_limit ? parseInt(daily_limit) : 500,
    });

    res.redirect('/accounts');
  } catch (error: any) {
    res.render('error', { title: 'Error', message: error.message, error: error.message, currentPage: '' });
  }
});

// Delete account
router.post('/accounts/:id/delete', (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));
    AccountModel.delete(id);
    smtpPool.removeTransporter(id);
    res.redirect('/accounts');
  } catch (error: any) {
    res.redirect('/accounts');
  }
});

// Toggle account active status
router.post('/accounts/:id/toggle', (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));
    const account = AccountModel.findById(id);
    if (account) {
      AccountModel.update(id, { is_active: account.is_active === 0 });
    }
    res.redirect('/accounts');
  } catch (error: any) {
    res.redirect('/accounts');
  }
});

// Test account SMTP
router.post('/accounts/:id/test', async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));
    const account = AccountModel.findById(id);

    if (!account) {
      res.redirect('/accounts');
      return;
    }

    const result = await smtpPool.verifyAccount(account);
    const accounts = AccountModel.getAllWithUsage();

    res.render('accounts', {
      title: 'Accounts',
      currentPage: 'accounts',
      accounts,
      testResult: { accountId: id, ...result },
    });
  } catch (error: any) {
    res.redirect('/accounts');
  }
});

// Send email page
router.get('/send', (req: Request, res: Response) => {
  res.render('send', { title: 'Send Email', currentPage: 'send', success: null, error: null });
});

// Send email POST
router.post('/send', (req: Request, res: Response) => {
  try {
    const { to, fromName, fromAddress, cc, bcc, subject, html, text, replyTo, strategy } = req.body;

    if (!to || !subject || (!html && !text)) {
      res.render('send', {
        title: 'Send Email',
        currentPage: 'send',
        success: null,
        error: 'To, Subject, and Body (HTML or Text) are required',
      });
      return;
    }

    EmailQueueModel.enqueue({ to, fromName, fromAddress, cc, bcc, subject, html, text, replyTo, strategy });

    res.render('send', {
      title: 'Send Email',
      currentPage: 'send',
      success: 'Email queued for sending!',
      error: null,
    });
  } catch (error: any) {
    res.render('send', {
      title: 'Send Email',
      currentPage: 'send',
      success: null,
      error: error.message,
    });
  }
});

// Queue page
router.get('/queue', (req: Request, res: Response) => {
  try {
    const status = String(req.query.status || '');
    const page = req.query.page ? parseInt(String(req.query.page)) : 1;

    const result = EmailQueueModel.findAll({ status: status || undefined as any, page, limit: 20 });
    const statusCounts = EmailQueueModel.getStatusCounts();

    res.render('queue', {
      title: 'Email Queue',
      currentPage: 'queue',
      items: result.items,
      total: result.total,
      page,
      pages: Math.ceil(result.total / 20),
      statusCounts,
      currentStatus: status || 'all',
    });
  } catch (error: any) {
    res.render('error', { title: 'Error', message: error.message, error: error.message, currentPage: '' });
  }
});

// Queue actions
router.post('/queue/:id/cancel', (req: Request, res: Response) => {
  EmailQueueModel.cancel(parseInt(String(req.params.id)));
  res.redirect('/queue');
});

router.post('/queue/:id/retry', (req: Request, res: Response) => {
  EmailQueueModel.retry(parseInt(String(req.params.id)));
  res.redirect('/queue');
});

// Logs page
router.get('/logs', (req: Request, res: Response) => {
  try {
    const page = req.query.page ? parseInt(String(req.query.page)) : 1;
    const status = String(req.query.status || '');
    const search = String(req.query.search || '');

    const result = EmailLogModel.findAll({
      page,
      limit: 20,
      status: status || undefined as any,
      search: search || undefined,
    });

    res.render('logs', {
      title: 'Email Logs',
      currentPage: 'logs',
      items: result.items,
      total: result.total,
      page,
      pages: Math.ceil(result.total / 20),
      currentStatus: status || 'all',
      search: search || '',
    });
  } catch (error: any) {
    res.render('error', { title: 'Error', message: error.message, error: error.message, currentPage: '' });
  }
});

export default router;
