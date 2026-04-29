import express from 'express';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import session from 'express-session';
import { config } from './config';
import { apiKeyAuth } from './middleware/auth.middleware';
import { apiRateLimiter } from './middleware/rate-limit.middleware';
import { errorHandler, notFoundHandler } from './middleware/error-handler.middleware';

// Routes
import dashboardRoutes from './routes/dashboard.routes';
import accountRoutes from './routes/api/account.routes';
import emailRoutes from './routes/api/email.routes';
import statsRoutes from './routes/api/stats.routes';

const app = express();

// Trust proxy (for Coolify / reverse proxy setups)
app.set('trust proxy', 1);

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      formAction: ["'self'"],
    },
  },
  crossOriginOpenerPolicy: false,
  originAgentCluster: false,
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// CORS for API
app.use(cors());

// Static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// Session for dashboard
app.use(session({
  secret: config.session.secret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true only if behind HTTPS-terminating reverse proxy
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax',
  },
}));

// API routes (protected by API key)
app.use('/api/accounts', apiRateLimiter, apiKeyAuth, accountRoutes);
app.use('/api', apiRateLimiter, apiKeyAuth, emailRoutes);
app.use('/api/stats', apiRateLimiter, apiKeyAuth, statsRoutes);

// Dashboard routes (protected by session auth)
app.use('/', dashboardRoutes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
