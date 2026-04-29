import { Router, Request, Response } from 'express';
import { AccountModel } from '../../models/account.model';
import { smtpPool } from '../../services/smtp-pool.service';
import { logger } from '../../utils/logger';

const router = Router();

// GET /api/accounts - List all accounts
router.get('/', (req: Request, res: Response) => {
  try {
    const accounts = AccountModel.getAllWithUsage();
    // Remove encrypted password from response
    const safe = accounts.map(({ app_password_encrypted, ...rest }) => rest);
    res.json({ success: true, data: safe });
  } catch (error: any) {
    logger.error(`List accounts error: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/accounts/:id - Get single account
router.get('/:id', (req: Request, res: Response) => {
  try {
    const account = AccountModel.findById(parseInt(String(req.params.id)));
    if (!account) {
      res.status(404).json({ success: false, error: 'Account not found' });
      return;
    }
    const { app_password_encrypted, ...safe } = account;
    res.json({ success: true, data: safe });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/accounts - Create new account
router.post('/', async (req: Request, res: Response) => {
  try {
    const { email, app_password, display_name, daily_limit } = req.body;

    if (!email || !app_password) {
      res.status(400).json({ success: false, error: 'email and app_password are required' });
      return;
    }

    // Check if email already exists
    const existing = AccountModel.findByEmail(email);
    if (existing) {
      res.status(409).json({ success: false, error: 'Account with this email already exists' });
      return;
    }

    const account = AccountModel.create({ email, app_password, display_name, daily_limit });
    const { app_password_encrypted, ...safe } = account;

    res.status(201).json({ success: true, data: safe });
  } catch (error: any) {
    logger.error(`Create account error: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/accounts/:id - Update account
router.put('/:id', (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));
    const { email, app_password, display_name, daily_limit, is_active } = req.body;

    const updated = AccountModel.update(id, { email, app_password, display_name, daily_limit, is_active });
    if (!updated) {
      res.status(404).json({ success: false, error: 'Account not found' });
      return;
    }

    // Remove old transporter if password changed
    if (app_password) {
      smtpPool.removeTransporter(id);
    }

    const { app_password_encrypted, ...safe } = updated;
    res.json({ success: true, data: safe });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/accounts/:id - Delete account
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));
    const deleted = AccountModel.delete(id);

    if (!deleted) {
      res.status(404).json({ success: false, error: 'Account not found' });
      return;
    }

    smtpPool.removeTransporter(id);
    res.json({ success: true, message: 'Account deleted' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/accounts/:id/test - Test SMTP connection
router.post('/:id/test', async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));
    const account = AccountModel.findById(id);

    if (!account) {
      res.status(404).json({ success: false, error: 'Account not found' });
      return;
    }

    const result = await smtpPool.verifyAccount(account);

    if (result.success) {
      res.json({ success: true, message: 'SMTP connection successful' });
    } else {
      res.json({ success: false, error: result.error });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
